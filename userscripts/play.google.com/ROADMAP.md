# Play Store Tweaks: roadmap

The userscript is meant to stay small and simple. Anything that needs cross-site requests,
caching or heavy page parsing goes in the extension version instead.

## Userscript

Remaining work, roughly in the order it is wanted. Once these are done the script is finished
and only gets bug fixes.

- **Language / region picker.** A small button that reopens the current app page in another
  language or country (`hl=` / `gl=`), for checking regional availability and prices or getting an
  English page on a foreign store. Needs a dropdown of common languages and countries and a way
  to remember favourites.
- **Horizontal scrollbar on screenshot galleries.**
- **More mirror buttons, as plain links.** APKPure, APKCombo, Aptoide, APK-DL and similar. Each
  just opens the site's search or app page (no link extraction, no captcha handling), as one more
  entry in `LINKS`, so it is toggleable and draggable like the others. Each site's search URL
  must be checked in a browser before adding. APKPure and APKCombo were unreachable from the
  test network (likely an ISP block), and Aptoide's site search returned no results, even for
  WhatsApp.
- **Optional: "forum post" Copy format.** Only if it can be built from what is already on the
  page (name, developer, link). If it needs a full page scrape, it moves to the extension.

## Extension

Needs a background worker, storage or real parsing, so it does not belong in the userscript.

- **APKMirror lookup.** Gray out the button if the app is not uploaded; on hover show the latest
  version and download count. Cached locally, with a Clear cache option and a switch to turn the
  check off.
- **Download buttons.** APK-DL, APKPure, APKCombo, APKPremier, Evozi, Aptoide, APK.support.
  - Direct download link extraction where the site allows it.
  - Captcha fallback (open the site's captcha page, then continue).
  - Failed-button states ("Removed!", "Captcha").
  - Hidden on paid apps.
- **Beta program.** Detect whether the app has a beta and whether you have joined, with a
  join / leave button. Has to work in other languages and when logged out.
- **Full data parse and export.** Title, description, installs, ratings histogram, in-app
  purchases, Android version, permissions, data safety, release and update dates, tags, icon,
  screenshots and video; plus developer pages (name, website, banner, icon, description) and
  collection pages (titles). Includes a full forum-post copy format.
- **"App not found" pages.** Show the download buttons plus an APKMirror search with
  Available / Not available.
