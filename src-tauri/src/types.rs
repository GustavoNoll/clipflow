use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ItemType {
    Text,
    Url,
    Code,
    Image,
    File,
    Color,
}

impl ItemType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Url => "url",
            Self::Code => "code",
            Self::Image => "image",
            Self::File => "file",
            Self::Color => "color",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "url" => Self::Url,
            "code" => Self::Code,
            "image" => Self::Image,
            "file" => Self::File,
            "color" => Self::Color,
            _ => Self::Text,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub is_default: bool,
    pub sort_order: i32,
    pub item_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardItem {
    pub id: String,
    pub content: String,
    pub preview: String,
    pub item_type: String,
    pub source_app: Option<String>,
    pub category_id: i64,
    pub category_name: String,
    pub is_favorite: bool,
    pub file_name: Option<String>,
    pub mime_type: Option<String>,
    pub thumbnail: Option<String>,
    pub content_size: i64,
    pub created_at: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchParams {
    pub query: Option<String>,
    pub category_id: Option<i64>,
    pub source_app: Option<String>,
    pub item_type: Option<String>,
    pub favorites_only: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedItems {
    pub items: Vec<ClipboardItem>,
    pub total: i64,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceApp {
    pub name: String,
    pub count: i64,
}

pub fn truncate_preview(text: &str, max: usize) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= max {
        return trimmed.to_string();
    }
    let truncated: String = trimmed.chars().take(max).collect();
    format!("{truncated}…")
}
