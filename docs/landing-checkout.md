# Landing checkout

ClipFlow's landing page reads these Vite environment variables:

```bash
VITE_CLIPFLOW_CHECKOUT_URL=https://buy.paddle.com/checkout/replace-with-clipflow-lifetime
VITE_CLIPFLOW_DOWNLOAD_URL=https://github.com/GustavoNoll/clipflow/releases/latest/download/ClipFlow_0.1.1_aarch64.dmg
```

## Pricing

- Launch price: `$10` lifetime.
- Post-launch price: `$15` lifetime.
- Recommended wording: lifetime app license with current major version updates.

## Direct trial download

The public `Download trial` CTA should point directly to a `.dmg` asset, not to the GitHub releases page.

Current direct download:

```text
https://github.com/GustavoNoll/clipflow/releases/latest/download/ClipFlow_0.1.1_aarch64.dmg
```

Because Tauri's generated DMG filename includes the app version, update `VITE_CLIPFLOW_DOWNLOAD_URL` after each release, or upload an additional stable asset name such as `ClipFlow-latest-aarch64.dmg`.

## Paddle setup

1. Create a product named `ClipFlow Lifetime`.
2. Create a one-time price for `$10`.
3. Enable localized payment methods. Keep Pix enabled for Brazil when available.
4. Configure post-purchase delivery:
   - link to the direct `.dmg` download, or
   - redirect to a download page, or
   - send a license key through a webhook flow.
5. Copy the Paddle checkout URL into `VITE_CLIPFLOW_CHECKOUT_URL`.

After launch, update the product price to `$15` and keep the landing copy unchanged unless the launch period has ended.

## License flow

The first version can ship with a simple Paddle checkout link plus download access. For app-side license activation, add this later:

1. Receive Paddle transaction webhook.
2. Generate a ClipFlow license key.
3. Email the license key to the buyer.
4. Add an `Activate license` screen in the app.
5. Validate the license against a small backend endpoint and cache the result locally.
