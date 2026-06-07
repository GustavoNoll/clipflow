use rusqlite::{params, Connection, OptionalExtension};
use std::path::PathBuf;
use thiserror::Error;

use crate::types::{Category, ClipboardItem, ItemType, PaginatedItems, SearchParams, SourceApp};

#[derive(Error, Debug)]
pub enum DbError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Item not found")]
    NotFound,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn open() -> Result<Self, DbError> {
        let path = db_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;",
        )?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                is_default INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS clipboard_items (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                raw_data BLOB,
                item_type TEXT NOT NULL,
                source_app TEXT,
                category_id INTEGER NOT NULL REFERENCES categories(id),
                is_favorite INTEGER NOT NULL DEFAULT 0,
                file_name TEXT,
                mime_type TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_items_created_at ON clipboard_items(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_items_category ON clipboard_items(category_id);
            CREATE INDEX IF NOT EXISTS idx_items_favorite ON clipboard_items(is_favorite);
            CREATE INDEX IF NOT EXISTS idx_items_source_app ON clipboard_items(source_app);
            CREATE INDEX IF NOT EXISTS idx_items_hash ON clipboard_items(content_hash);

            CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_items_fts USING fts5(
                content,
                file_name,
                source_app,
                content='clipboard_items',
                content_rowid='rowid',
                tokenize='unicode61 remove_diacritics 2'
            );

            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );

            CREATE TABLE IF NOT EXISTS item_tags (
                item_id TEXT NOT NULL REFERENCES clipboard_items(id) ON DELETE CASCADE,
                tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (item_id, tag_id)
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            "#,
        )?;

        self.ensure_item_column("is_pinned", "INTEGER NOT NULL DEFAULT 0")?;
        self.ensure_item_column("pin_shortcut", "INTEGER")?;
        self.conn.execute_batch(
            r#"
            CREATE INDEX IF NOT EXISTS idx_items_pinned ON clipboard_items(is_pinned);
            CREATE INDEX IF NOT EXISTS idx_items_pin_shortcut ON clipboard_items(pin_shortcut);
            "#,
        )?;
        self.seed_default_categories()?;
        self.ensure_fts_triggers()?;
        Ok(())
    }

    fn ensure_item_column(&self, name: &str, definition: &str) -> Result<(), DbError> {
        let columns = self
            .conn
            .prepare("PRAGMA table_info(clipboard_items)")?
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;

        if !columns.iter().any(|column| column == name) {
            self.conn.execute_batch(&format!(
                "ALTER TABLE clipboard_items ADD COLUMN {name} {definition};"
            ))?;
        }

        Ok(())
    }

    fn seed_default_categories(&self) -> Result<(), DbError> {
        let defaults = [
            ("History", 0),
            ("Prompts", 1),
            ("Assets", 2),
            ("Code", 3),
            ("Screenshots", 4),
            ("Colors", 5),
        ];
        for (name, order) in defaults {
            self.conn.execute(
                "INSERT OR IGNORE INTO categories (name, is_default, sort_order) VALUES (?1, 1, ?2)",
                params![name, order],
            )?;
        }
        Ok(())
    }

    fn ensure_fts_triggers(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            CREATE TRIGGER IF NOT EXISTS clipboard_items_ai AFTER INSERT ON clipboard_items BEGIN
                INSERT INTO clipboard_items_fts(rowid, content, file_name, source_app)
                VALUES (new.rowid, new.content, COALESCE(new.file_name, ''), COALESCE(new.source_app, ''));
            END;

            CREATE TRIGGER IF NOT EXISTS clipboard_items_ad AFTER DELETE ON clipboard_items BEGIN
                INSERT INTO clipboard_items_fts(clipboard_items_fts, rowid, content, file_name, source_app)
                VALUES ('delete', old.rowid, old.content, COALESCE(old.file_name, ''), COALESCE(old.source_app, ''));
            END;

            CREATE TRIGGER IF NOT EXISTS clipboard_items_au AFTER UPDATE ON clipboard_items BEGIN
                INSERT INTO clipboard_items_fts(clipboard_items_fts, rowid, content, file_name, source_app)
                VALUES ('delete', old.rowid, old.content, COALESCE(old.file_name, ''), COALESCE(old.source_app, ''));
                INSERT INTO clipboard_items_fts(rowid, content, file_name, source_app)
                VALUES (new.rowid, new.content, COALESCE(new.file_name, ''), COALESCE(new.source_app, ''));
            END;
            "#,
        )?;
        Ok(())
    }

    pub fn default_category_id(&self) -> Result<i64, DbError> {
        self.conn
            .query_row(
                "SELECT id FROM categories WHERE name = 'History' LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }

    pub fn category_id_by_name(&self, name: &str) -> Result<i64, DbError> {
        self.conn
            .query_row(
                "SELECT id FROM categories WHERE name = ?1 LIMIT 1",
                params![name],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }

    pub fn insert_item(
        &self,
        id: &str,
        content: &str,
        content_hash: &str,
        raw_data: Option<&[u8]>,
        item_type: ItemType,
        source_app: Option<&str>,
        category_id: i64,
        file_name: Option<&str>,
        mime_type: Option<&str>,
        created_at: i64,
    ) -> Result<Option<String>, DbError> {
        const DEDUP_WINDOW_SECS: i64 = 45;

        if let Some(existing_id) = self
            .conn
            .query_row(
                "SELECT id FROM clipboard_items
                 WHERE content_hash = ?1 AND created_at > ?2
                 ORDER BY created_at DESC LIMIT 1",
                params![content_hash, created_at - DEDUP_WINDOW_SECS],
                |row| row.get::<_, String>(0),
            )
            .optional()?
        {
            if let Some(app) = source_app.filter(|name| !name.is_empty()) {
                let updated = self.conn.execute(
                    "UPDATE clipboard_items
                     SET source_app = ?1, updated_at = ?2
                     WHERE id = ?3 AND (source_app IS NULL OR source_app = '')",
                    params![app, created_at, existing_id],
                )?;
                if updated > 0 {
                    return Ok(Some(existing_id));
                }
            }
            return Ok(None);
        }

        self.conn.execute(
            r#"INSERT INTO clipboard_items
               (id, content, content_hash, raw_data, item_type, source_app, category_id,
                file_name, mime_type, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)"#,
            params![
                id,
                content,
                content_hash,
                raw_data,
                item_type.as_str(),
                source_app,
                category_id,
                file_name,
                mime_type,
                created_at,
            ],
        )?;
        self.enforce_history_limit()?;
        Ok(Some(id.to_string()))
    }

    fn enforce_history_limit(&self) -> Result<(), DbError> {
        let settings = self.get_settings().unwrap_or_default();
        if settings.history_limit <= 0 {
            return Ok(());
        }
        self.conn.execute(
            "DELETE FROM clipboard_items
             WHERE id IN (
                SELECT id FROM clipboard_items
                ORDER BY created_at DESC
                LIMIT -1 OFFSET ?1
             )",
            params![settings.history_limit],
        )?;
        Ok(())
    }

    pub fn list_items(&self, params: &SearchParams) -> Result<PaginatedItems, DbError> {
        let limit = params.limit.unwrap_or(50).min(200);
        let offset = params.offset.unwrap_or(0);
        let parsed_query = ParsedSearchQuery::from(params.query.as_deref().unwrap_or(""));
        let query = parsed_query.text.as_str();

        if !query.is_empty() {
            return self.search_fts(params, &parsed_query, limit, offset);
        }

        let mut conditions = vec!["1=1".to_string()];
        let mut sql_params: Vec<Box<dyn rusqlite::ToSql>> = vec![];

        apply_filters(params, &parsed_query, &mut conditions, &mut sql_params);

        if let Some(cat) = params.category_id {
            conditions.push(format!("ci.category_id = ?{}", sql_params.len() + 1));
            sql_params.push(Box::new(cat));
        }

        let where_clause = conditions.join(" AND ");
        let count_sql = format!("SELECT COUNT(*) FROM clipboard_items ci WHERE {where_clause}");
        let total: i64 = {
            let mut stmt = self.conn.prepare(&count_sql)?;
            let refs: Vec<&dyn rusqlite::ToSql> = sql_params.iter().map(|p| p.as_ref()).collect();
            stmt.query_row(refs.as_slice(), |row| row.get(0))?
        };

        let list_sql = format!(
            r#"SELECT ci.id, ci.content, ci.item_type, ci.source_app, ci.category_id,
                      c.name, ci.is_favorite, ci.is_pinned, ci.pin_shortcut, ci.file_name, ci.mime_type, ci.raw_data, ci.created_at
               FROM clipboard_items ci
               JOIN categories c ON c.id = ci.category_id
               WHERE {where_clause}
               ORDER BY ci.is_pinned DESC, ci.created_at DESC
               LIMIT ?{} OFFSET ?{}"#,
            sql_params.len() + 1,
            sql_params.len() + 2
        );

        let mut stmt = self.conn.prepare(&list_sql)?;
        sql_params.push(Box::new(limit));
        sql_params.push(Box::new(offset));
        let refs: Vec<&dyn rusqlite::ToSql> = sql_params.iter().map(|p| p.as_ref()).collect();
        let items = stmt
            .query_map(refs.as_slice(), map_item_row)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(PaginatedItems {
            has_more: offset + limit < total,
            total,
            items,
        })
    }

    fn search_fts(
        &self,
        params: &SearchParams,
        parsed_query: &ParsedSearchQuery,
        limit: i64,
        offset: i64,
    ) -> Result<PaginatedItems, DbError> {
        let fts_query = parsed_query
            .text
            .split_whitespace()
            .map(|t| format!("\"{t}\"*"))
            .collect::<Vec<_>>()
            .join(" ");

        let mut conditions = vec!["clipboard_items_fts MATCH ?1".to_string()];
        let mut sql_params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(fts_query)];

        apply_filters(params, parsed_query, &mut conditions, &mut sql_params);

        if let Some(cat) = params.category_id {
            conditions.push(format!("ci.category_id = ?{}", sql_params.len() + 1));
            sql_params.push(Box::new(cat));
        }

        let where_clause = conditions.join(" AND ");
        let count_sql = format!(
            r#"SELECT COUNT(*)
               FROM clipboard_items ci
               JOIN clipboard_items_fts fts ON fts.rowid = ci.rowid
               WHERE {where_clause}"#
        );
        let total: i64 = {
            let mut stmt = self.conn.prepare(&count_sql)?;
            let refs: Vec<&dyn rusqlite::ToSql> = sql_params.iter().map(|p| p.as_ref()).collect();
            stmt.query_row(refs.as_slice(), |row| row.get(0))?
        };

        let list_sql = format!(
            r#"SELECT ci.id, ci.content, ci.item_type, ci.source_app, ci.category_id,
                      c.name, ci.is_favorite, ci.is_pinned, ci.pin_shortcut, ci.file_name, ci.mime_type, ci.raw_data, ci.created_at
               FROM clipboard_items ci
               JOIN categories c ON c.id = ci.category_id
               JOIN clipboard_items_fts fts ON fts.rowid = ci.rowid
               WHERE {where_clause}
               ORDER BY ci.is_pinned DESC, rank, ci.created_at DESC
               LIMIT ?{} OFFSET ?{}"#,
            sql_params.len() + 1,
            sql_params.len() + 2
        );

        let mut stmt = self.conn.prepare(&list_sql)?;
        sql_params.push(Box::new(limit));
        sql_params.push(Box::new(offset));
        let refs: Vec<&dyn rusqlite::ToSql> = sql_params.iter().map(|p| p.as_ref()).collect();
        let items = stmt
            .query_map(refs.as_slice(), map_item_row)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(PaginatedItems {
            has_more: offset + limit < total,
            total,
            items,
        })
    }

    pub fn get_recent(&self, limit: i64) -> Result<Vec<ClipboardItem>, DbError> {
        let result = self.list_items(&SearchParams {
            query: None,
            category_id: None,
            source_app: None,
            item_type: None,
            favorites_only: None,
            pinned_only: None,
            limit: Some(limit),
            offset: Some(0),
        })?;
        Ok(result.items)
    }

    pub fn get_item(&self, id: &str) -> Result<ClipboardItem, DbError> {
        let mut stmt = self.conn.prepare(
            r#"SELECT ci.id, ci.content, ci.item_type, ci.source_app, ci.category_id,
                      c.name, ci.is_favorite, ci.is_pinned, ci.pin_shortcut, ci.file_name, ci.mime_type, ci.raw_data, ci.created_at
               FROM clipboard_items ci
               JOIN categories c ON c.id = ci.category_id
               WHERE ci.id = ?1"#,
        )?;
        stmt.query_row(params![id], map_item_row)
            .optional()?
            .ok_or(DbError::NotFound)
    }

    pub fn delete_item(&self, id: &str) -> Result<(), DbError> {
        let changed = self
            .conn
            .execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])?;
        if changed == 0 {
            return Err(DbError::NotFound);
        }
        Ok(())
    }

    pub fn delete_items(&self, ids: &[String]) -> Result<i64, DbError> {
        if ids.is_empty() {
            return Ok(0);
        }
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("DELETE FROM clipboard_items WHERE id IN ({placeholders})");
        let mut stmt = self.conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> =
            ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        let changed = stmt.execute(params.as_slice())?;
        Ok(changed as i64)
    }

    pub fn clear_history(&self) -> Result<i64, DbError> {
        let changed = self.conn.execute("DELETE FROM clipboard_items", [])?;
        Ok(changed as i64)
    }

    pub fn toggle_favorite(&self, id: &str) -> Result<bool, DbError> {
        self.conn.execute(
            "UPDATE clipboard_items SET is_favorite = CASE is_favorite WHEN 1 THEN 0 ELSE 1 END, updated_at = ?2 WHERE id = ?1",
            params![id, chrono::Utc::now().timestamp()],
        )?;
        let fav: i64 = self.conn.query_row(
            "SELECT is_favorite FROM clipboard_items WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        Ok(fav == 1)
    }

    pub fn set_items_favorite(&self, ids: &[String], favorite: bool) -> Result<i64, DbError> {
        self.update_bool_for_items(ids, "is_favorite", favorite)
    }

    pub fn set_items_pinned(&self, ids: &[String], pinned: bool) -> Result<i64, DbError> {
        if ids.is_empty() {
            return Ok(0);
        }
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "UPDATE clipboard_items SET is_pinned = {}, pin_shortcut = CASE WHEN {} = 0 THEN NULL ELSE pin_shortcut END, updated_at = ? WHERE id IN ({placeholders})",
            if pinned { 1 } else { 0 },
            if pinned { 1 } else { 0 }
        );
        self.execute_item_update(&sql, ids)
    }

    fn update_bool_for_items(
        &self,
        ids: &[String],
        column: &str,
        enabled: bool,
    ) -> Result<i64, DbError> {
        if ids.is_empty() {
            return Ok(0);
        }
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "UPDATE clipboard_items SET {column} = {}, updated_at = ? WHERE id IN ({placeholders})",
            if enabled { 1 } else { 0 }
        );
        self.execute_item_update(&sql, ids)
    }

    fn execute_item_update(&self, sql: &str, ids: &[String]) -> Result<i64, DbError> {
        let mut values: Vec<Box<dyn rusqlite::ToSql>> =
            vec![Box::new(chrono::Utc::now().timestamp())];
        values.extend(
            ids.iter()
                .cloned()
                .map(|id| Box::new(id) as Box<dyn rusqlite::ToSql>),
        );
        let refs: Vec<&dyn rusqlite::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        Ok(self.conn.prepare(sql)?.execute(refs.as_slice())? as i64)
    }

    pub fn set_pin_shortcut(&self, id: &str, shortcut: Option<i64>) -> Result<(), DbError> {
        if let Some(slot) = shortcut {
            self.conn.execute(
                "UPDATE clipboard_items SET pin_shortcut = NULL WHERE pin_shortcut = ?1 AND id != ?2",
                params![slot, id],
            )?;
        }
        self.conn.execute(
            "UPDATE clipboard_items SET is_pinned = 1, pin_shortcut = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, shortcut, chrono::Utc::now().timestamp()],
        )?;
        Ok(())
    }

    pub fn get_pinned_by_shortcut(&self, shortcut: i64) -> Result<Option<ClipboardItem>, DbError> {
        let mut stmt = self.conn.prepare(
            r#"SELECT ci.id, ci.content, ci.item_type, ci.source_app, ci.category_id,
                      c.name, ci.is_favorite, ci.is_pinned, ci.pin_shortcut, ci.file_name, ci.mime_type, ci.raw_data, ci.created_at
               FROM clipboard_items ci
               JOIN categories c ON c.id = ci.category_id
               WHERE ci.is_pinned = 1 AND ci.pin_shortcut = ?1
               ORDER BY ci.created_at DESC
               LIMIT 1"#,
        )?;
        stmt.query_row(params![shortcut], map_item_row)
            .optional()
            .map_err(Into::into)
    }

    pub fn set_category(&self, item_id: &str, category_id: i64) -> Result<(), DbError> {
        self.conn.execute(
            "UPDATE clipboard_items SET category_id = ?2, updated_at = ?3 WHERE id = ?1",
            params![item_id, category_id, chrono::Utc::now().timestamp()],
        )?;
        Ok(())
    }

    pub fn list_categories(&self) -> Result<Vec<Category>, DbError> {
        let mut stmt = self.conn.prepare(
            r#"SELECT c.id, c.name, c.is_default, c.sort_order,
                      (SELECT COUNT(*) FROM clipboard_items ci WHERE ci.category_id = c.id) as item_count
               FROM categories c
               ORDER BY c.sort_order, c.name"#,
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Category {
                id: row.get(0)?,
                name: row.get(1)?,
                is_default: row.get::<_, i64>(2)? == 1,
                sort_order: row.get(3)?,
                item_count: row.get(4)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn create_category(&self, name: &str) -> Result<Category, DbError> {
        let max_order: i32 = self.conn.query_row(
            "SELECT COALESCE(MAX(sort_order), 0) FROM categories",
            [],
            |row| row.get(0),
        )?;
        self.conn.execute(
            "INSERT INTO categories (name, is_default, sort_order) VALUES (?1, 0, ?2)",
            params![name, max_order + 1],
        )?;
        let id = self.conn.last_insert_rowid();
        Ok(Category {
            id,
            name: name.to_string(),
            is_default: false,
            sort_order: max_order + 1,
            item_count: 0,
        })
    }

    pub fn rename_category(&self, id: i64, name: &str) -> Result<(), DbError> {
        self.conn.execute(
            "UPDATE categories SET name = ?2 WHERE id = ?1 AND is_default = 0",
            params![id, name],
        )?;
        Ok(())
    }

    pub fn delete_category(&self, id: i64) -> Result<(), DbError> {
        let history_id = self.default_category_id()?;
        self.conn.execute(
            "UPDATE clipboard_items SET category_id = ?2 WHERE category_id = ?1",
            params![id, history_id],
        )?;
        self.conn.execute(
            "DELETE FROM categories WHERE id = ?1 AND is_default = 0",
            params![id],
        )?;
        Ok(())
    }

    pub fn list_source_apps(&self) -> Result<Vec<SourceApp>, DbError> {
        let mut stmt = self.conn.prepare(
            r#"SELECT source_app, COUNT(*) as cnt
               FROM clipboard_items
               WHERE source_app IS NOT NULL AND source_app != ''
               GROUP BY source_app
               ORDER BY cnt DESC, source_app ASC"#,
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(SourceApp {
                name: row.get(0)?,
                count: row.get(1)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn get_settings(&self) -> Result<crate::settings::AppSettings, DbError> {
        let raw: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![crate::settings::SETTINGS_KEY],
                |row| row.get(0),
            )
            .optional()?;

        match raw {
            Some(json) => Ok(serde_json::from_str(&json).unwrap_or_default()),
            None => Ok(crate::settings::AppSettings::default()),
        }
    }

    pub fn save_settings(&self, settings: &crate::settings::AppSettings) -> Result<(), DbError> {
        let json = serde_json::to_string(settings).unwrap_or_default();
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![crate::settings::SETTINGS_KEY, json],
        )?;
        Ok(())
    }
}

fn map_item_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ClipboardItem> {
    let content: String = row.get(1)?;
    let item_type: String = row.get(2)?;
    let raw_data: Option<Vec<u8>> = row.get(11)?;
    let created_at_ts: i64 = row.get(12)?;
    let created_at = chrono::DateTime::<chrono::Utc>::from_timestamp(created_at_ts, 0)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default();

    let preview = if item_type == "image" {
        content.lines().next().unwrap_or(&content).to_string()
    } else {
        crate::types::truncate_preview(&content, 200)
    };
    let thumbnail = match item_type.as_str() {
        "image" => raw_data.as_ref().map(|data| {
            use base64::{engine::general_purpose::STANDARD, Engine};
            format!("data:image/png;base64,{}", STANDARD.encode(data))
        }),
        "bundle" => raw_data.as_ref().map(|data| {
            use base64::{engine::general_purpose::STANDARD, Engine};
            format!(
                "data:application/vnd.clipflow.bundle+json;base64,{}",
                STANDARD.encode(data)
            )
        }),
        _ => None,
    };
    let content_size = compute_content_size(&item_type, &content, &raw_data);

    Ok(ClipboardItem {
        id: row.get(0)?,
        content,
        preview,
        item_type,
        source_app: row.get(3)?,
        category_id: row.get(4)?,
        category_name: row.get(5)?,
        is_favorite: row.get::<_, i64>(6)? == 1,
        is_pinned: row.get::<_, i64>(7)? == 1,
        pin_shortcut: row.get(8)?,
        file_name: row.get(9)?,
        mime_type: row.get(10)?,
        thumbnail,
        content_size,
        created_at,
        tags: vec![],
    })
}

fn compute_content_size(item_type: &str, content: &str, raw_data: &Option<Vec<u8>>) -> i64 {
    if let Some(raw) = raw_data {
        return raw.len() as i64;
    }
    if item_type == "file" {
        let path = content.lines().next().unwrap_or(content).trim();
        if let Ok(meta) = std::fs::metadata(path) {
            return meta.len() as i64;
        }
    }
    content.as_bytes().len() as i64
}

#[derive(Default)]
struct ParsedSearchQuery {
    text: String,
    app: Option<String>,
    item_type: Option<String>,
    favorites_only: bool,
    pinned_only: bool,
}

impl ParsedSearchQuery {
    fn from(raw: &str) -> Self {
        let mut parsed = Self::default();
        let mut text = Vec::new();

        for token in raw.split_whitespace() {
            let lower = token.to_lowercase();
            if lower == "@fav" || lower == "@favorite" || lower == "@favorites" {
                parsed.favorites_only = true;
            } else if lower == "@pin" || lower == "@pinned" {
                parsed.pinned_only = true;
            } else if let Some(value) = lower.strip_prefix("@type:") {
                if !value.is_empty() {
                    parsed.item_type = Some(value.to_string());
                }
            } else if let Some(value) = token.strip_prefix("@app:") {
                if !value.is_empty() {
                    parsed.app = Some(value.to_string());
                }
            } else {
                text.push(token);
            }
        }

        parsed.text = text.join(" ");
        parsed
    }
}

fn apply_filters(
    params: &SearchParams,
    parsed_query: &ParsedSearchQuery,
    conditions: &mut Vec<String>,
    sql_params: &mut Vec<Box<dyn rusqlite::ToSql>>,
) {
    let source_app = parsed_query.app.as_ref().or(params.source_app.as_ref());
    if let Some(app) = source_app {
        conditions.push(format!(
            "LOWER(COALESCE(ci.source_app, '')) LIKE ?{}",
            sql_params.len() + 1
        ));
        sql_params.push(Box::new(format!("%{}%", app.to_lowercase())));
    }

    let item_type = parsed_query
        .item_type
        .as_ref()
        .or(params.item_type.as_ref());
    if let Some(item_type) = item_type {
        conditions.push(format!("ci.item_type = ?{}", sql_params.len() + 1));
        sql_params.push(Box::new(item_type.clone()));
    }

    if params.favorites_only.unwrap_or(false) || parsed_query.favorites_only {
        conditions.push("ci.is_favorite = 1".to_string());
    }

    if params.pinned_only.unwrap_or(false) || parsed_query.pinned_only {
        conditions.push("ci.is_pinned = 1".to_string());
    }
}

pub fn db_path() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ClipFlow")
        .join("clipflow.db")
}
