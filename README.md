# Monkey Business

A collection of browser userscripts for [Violentmonkey](https://violentmonkey.github.io/), [Tampermonkey](https://www.tampermonkey.net/), [Greasemonkey](https://www.greasespot.net/) and other compatible userscript managers.

## Scripts

### xkcd.com

| Script | Description | Install |
| --- | --- | --- |
| <img src="userscripts/xkcd.com/icons/fit-to-screen.png" width="32" alt=""> Fit to Screen | Slim header and a comic scaled to fill the window. Press `C` to toggle. | [Install](https://greasyfork.org/en/scripts/601918-xkcd-fit-to-screen) |
| <img src="userscripts/xkcd.com/icons/instant-navigation.png" width="32" alt=""> Instant Navigation | Prefetches neighbouring comics and switches between them without a page reload. | [Install](https://greasyfork.org/en/scripts/601920-xkcd-instant-navigation) |
| <img src="userscripts/xkcd.com/icons/keyboard-shortcuts.png" width="32" alt=""> Keyboard Shortcuts | Arrows or `A`/`D`, `Home`/`End`, `R` random, `T` alt text, `I` info, `E` Explain xkcd (also an Explain button next to Random), `H` help. | [Install](https://greasyfork.org/en/scripts/601921-xkcd-keyboard-shortcuts) |

### play.google.com

| Script | Description | Install |
| --- | --- | --- |
| <img src="userscripts/play.google.com/icons/play-store-tweaks.png" width="32" alt=""> Play Store Tweaks | Extra links, shortcuts and fixes for the Google Play Store. Adds buttons next to Install on app pages and search results: Beta (join/leave page), Copy (scroll over it to switch between Markdown, plain text, BBCode, HTML and JSON; right-click it to choose what to copy (name, developer, ID, link) and in what order, and which formats are in the cycle), APKM (APKMirror), AP (Android Police), AB (AppBrain), Exodus (Exodus Privacy) and a globe button for language and country (scroll over it to cycle countries, Shift + scroll for languages, right-click for two small wheels, click to go back to the default). Links that go through Google's redirector are pointed straight at their destination. The gear at the end of the row turns each feature on or off, and you can drag the buttons (and Install itself) into any order, with an optional line break to split them into two lines. Both menus have a Reset button. | [Install](https://raw.githubusercontent.com/AryanBhanot/monkey-business/main/userscripts/play.google.com/play-store-tweaks.user.js) |

The three xkcd scripts are designed to work together but each runs on its own.

## Installing

1. Install a userscript manager in your browser.
2. Click the **Install** link next to the script you want. It opens the script (on [Greasy Fork](https://greasyfork.org/) or as a raw `.user.js` file on GitHub), and your manager offers to install it.
3. Confirm the installation in the manager's prompt.

Scripts include `@updateURL`/`@downloadURL`, so your manager can pick up new versions automatically.

## License

[MIT](LICENSE)
