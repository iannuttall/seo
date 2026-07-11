export function oauthCallbackPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <title>SEO Skills is connected</title>
    <style>
      :root {
        color-scheme: light dark;
        --background: #fafafa;
        --background-raised: #ffffff;
        --foreground: #343434;
        --foreground-muted: #737373;
        --border: #eaeaea;
        --primary: #2589b6;
        --primary-soft: #e9f6fb;
      }
      * { box-sizing: border-box; }
      body {
        background: var(--background);
        color: var(--foreground);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        min-height: 100vh;
      }
      .frame {
        margin: 0 auto;
        max-width: 768px;
        padding: 0 24px;
        width: 100%;
      }
      header { border-bottom: 1px solid var(--border); }
      .nav {
        align-items: center;
        display: flex;
        gap: 8px;
        min-height: 65px;
      }
      .brand {
        align-items: center;
        color: inherit;
        display: inline-flex;
        font-size: 16px;
        font-weight: 700;
        gap: 6px;
        letter-spacing: -0.02em;
        text-decoration: none;
      }
      .brand svg { height: 20px; width: 20px; }
      main { min-height: calc(100vh - 65px); }
      .hero {
        border-bottom: 1px solid var(--border);
        padding: clamp(72px, 15vw, 144px) 0;
      }
      .content { max-width: 620px; }
      .status {
        align-items: center;
        color: var(--primary);
        display: flex;
        font-size: 15px;
        font-weight: 650;
        gap: 8px;
        margin: 0 0 18px;
      }
      .status-mark {
        background: var(--primary);
        border-radius: 50%;
        height: 8px;
        width: 8px;
      }
      h1 {
        font-size: clamp(38px, 7vw, 58px);
        font-weight: 550;
        letter-spacing: -0.055em;
        line-height: 0.98;
        margin: 0;
        text-wrap: balance;
      }
      .lead {
        color: var(--foreground-muted);
        font-size: clamp(20px, 3vw, 24px);
        font-weight: 500;
        letter-spacing: -0.02em;
        line-height: 1.35;
        margin: 24px 0 0;
        max-width: 600px;
      }
      code {
        background: var(--background-raised);
        border: 1px solid var(--border);
        color: var(--foreground);
        display: inline-block;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.84em;
        letter-spacing: -0.02em;
        padding: 3px 7px;
      }
      .details {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        padding: 36px 0 48px;
      }
      .detail {
        border-left: 1px solid var(--border);
        padding-left: 16px;
      }
      .detail h2 {
        font-size: 15px;
        font-weight: 650;
        letter-spacing: -0.01em;
        margin: 0;
      }
      .detail p {
        color: var(--foreground-muted);
        font-size: 15px;
        line-height: 1.5;
        margin: 6px 0 0;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --background: #343434;
          --background-raised: #3d3d3d;
          --foreground: #fafafa;
          --foreground-muted: #b8b8b8;
          --border: #484848;
          --primary: #8ed2ef;
          --primary-soft: #16485f;
        }
      }
      @media (max-width: 560px) {
        .frame { padding: 0 20px; }
        .hero { padding: 72px 0; }
        .details { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="frame nav">
        <span class="brand">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12,8c-2.2,0-4,1.8-4,4s1.8,4,4,4s4-1.8,4-4C16,9.8,14.2,8,12,8z M3,9L3,9c0.6,0,1-0.4,1-1V5c0-0.6,0.4-1,1-1h3 c0.6,0,1-0.4,1-1S8.6,2,8,2H5C3.3,2,2,3.3,2,5v3C2,8.6,2.4,9,3,9z M8,20H5c-0.6,0-1-0.4-1-1v-3c0-0.6-0.4-1-1-1s-1,0.4-1,1v3 c0,1.7,1.3,3,3,3h3c0.6,0,1-0.4,1-1S8.6,20,8,20z M21,15L21,15c-0.6,0-1,0.4-1,1v3c0,0.6-0.4,1-1,1h-3c-0.6,0-1,0.4-1,1s0.4,1,1,1h3 c1.7,0,3-1.3,3-3v-3C22,15.4,21.6,15,21,15z M19,2h-3c-0.6,0-1,0.4-1,1s0.4,1,1,1h3c0.6,0,1,0.4,1,1v3c0,0.6,0.4,1,1,1s1-0.4,1-1V5 C22,3.3,20.7,2,19,2z" />
          </svg>
          SEO Skills
        </span>
      </div>
    </header>
    <main>
      <section class="hero">
        <div class="frame content">
          <p class="status"><span class="status-mark" aria-hidden="true"></span>Google account connected</p>
          <h1>You can start your first SEO report.</h1>
          <p class="lead">Go back to your terminal to continue. SEO Skills will help you choose a site and save a project profile before future reports.</p>
        </div>
      </section>
      <div class="frame details">
        <section class="detail">
          <h2>Safe to close</h2>
          <p>This tab has done its job. The CLI is waiting for you in the terminal.</p>
        </section>
        <section class="detail">
          <h2>Read-only access</h2>
          <p>SEO Skills can read the Google data you choose. It cannot change your site or Google account.</p>
        </section>
      </div>
    </main>
  </body>
</html>`
}
