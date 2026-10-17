# Monkey Business

A collection of browser userscripts for Greasemonkey, Violentmonkey, Tampermonkey, and compatible userscript managers.

## Repository layout

```text
userscripts/
  example.com/
    script-name.user.js
  another-site.com/
    another-script.user.js
```

Organize scripts by the primary website they target. Use a lowercase website hostname for the directory and a descriptive `.user.js` filename for each script. Scripts that target several unrelated websites can go in `userscripts/multi-site/`.

## Adding a userscript

1. Add a new `userscripts/<website>/<script-name>.user.js` file.
2. Put the `==UserScript==` metadata block at the very top of the file.
3. Include a focused `@match` or `@include` rule so the script only runs where intended.
4. Document any required permissions with `@grant` and keep the script self-contained when practical.

Example metadata block:

```javascript
// ==UserScript==
// @name         My userscript
// @namespace    https://github.com/<your-username>/monkey-business
// @version      1.0.0
// @description  Describe what this script changes.
// @author       Your name
// @match        https://example.com/*
// @grant        none
// ==/UserScript==
```

Scripts can be installed by opening their raw GitHub URL in a compatible userscript manager. Public contributions should include a clear description and avoid exposing credentials, tokens, or personal data.

## License

This project is licensed under the [MIT License](LICENSE).