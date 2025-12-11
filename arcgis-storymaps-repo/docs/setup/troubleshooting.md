# Troubleshooting

<!-- omit in toc -->
## Table of Contents

- [I'm seeing the following console error with the video block. Is this expected?](#im-seeing-the-following-console-error-with-the-video-block-is-this-expected)
- [How do I generate a self-signed root authority certificate after my old one expires? I'm getting the SSL error page every time I navigate to my localhost app URL.](#how-do-i-generate-a-self-signed-root-authority-certificate-after-my-old-one-expires-im-getting-the-ssl-error-page-every-time-i-navigate-to-my-localhost-app-url)
- [Local server URL won't open in Firefox (see screenshot). What should I do?](#local-server-url-wont-open-in-firefox-see-screenshot-what-should-i-do)
- [I cannot commit with GitHub Desktop. What should I do?](#i-cannot-commit-with-github-desktop-what-should-i-do)
- [I'm in a ghost signed-in state on AGSM/SMX and my content isn't loading. What should I do?](#im-in-a-ghost-signed-in-state-on-agsmsmx-and-my-content-isnt-loading-what-should-i-do)

## I'm seeing the following console error with the video block. Is this expected?

![Error messages](https://devtopia.esri.com/storage/user/1731/files/4e669af3-72df-4f81-906d-a64f151da8a3)

This is expected locally with devext tier build. [Building the app with prod tier](https://devtopia.esri.com/WebGIS/arcgis-storymaps/wiki/FAQ#how-do-i-log-into-agsm-production-tier-locally) will work around it.

> Answered by Mark Cooney

## How do I generate a self-signed root authority certificate after my old one expires? I'm getting the SSL error page every time I navigate to my localhost app URL.

<img width="700" alt="Chrome SSL error page. Title reads: Your connection is not private." src="https://devtopia.esri.com/storage/user/4196/files/d38f6b1d-1b28-47e7-bc1e-eb2ba6042159">

At the time of this writing (01/12/2023), there is no way to renew a certificate other than to manually delete it and have [devcert](https://github.com/davewasmer/devcert/) generate a new one on server startup. See this GitHub issue for more context: [Root authority certificate renewal](https://github.com/davewasmer/devcert/issues/22).

On Mac, run the following commands from the command line:

1. Switch to the devcert CA directory: `cd ~/Library/'Application Support'/devcert/certificate-authority`.
2. Delete your certificate and private key: `rm private-key.key certificate.cert`. Type `y` and press Enter if/when prompted.
3. Clear out `index.txt`: `> index.txt`.
4. Now remove all registered domains: `cd ~/Library/'Application Support'/devcert/domains`, then `rm -rf` all directories. (Run `ls` to view them. They should match the hostnames for your local apps. e.g., `username.arcgis.com` for AGSM and `local.dev.storymaps.com` for SMX).
5. Switch to your storymaps repo directory. Run the dev command for AGSM or SMX (e.g., `yarn dev:smx`).
6. You should get a system popup asking you to enter your password to make changes to the System Certificate Trust Settings. Enter your password.
7. Navigate to your app's localhost URL. You should no longer see the SSL error page.

Windows: Not sure.

Relevant snippets of code that run `decert` on server startup:

- [SMX](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/3ca39515b049c9b8eb2ee1594472860ced8ddd7c/config/packages/shared-config/express-server/index.js#L24-L27)
- [AGSM](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/3ca39515b049c9b8eb2ee1594472860ced8ddd7c/packages/storymaps-app/static-server.js#L20-L31)

> Answered by: Aleksandr Hovhannisyan

## Local server URL won't open in Firefox (see screenshot). What should I do?

<img src="https://devtopia.esri.com/storage/user/1731/files/18aa8436-a9f0-43ea-aaf3-fe1cf47b48a2" width="500"/>

> Answered By James Newton

Firefox keeps its own settings for which certificates are trusted. In particular, it only looks at the unmodifiable System Roots store in the MacOS keychain. esolved the issue thus:
	
1. In **Keychain Access** app, go to the **System** (not System Roots) keychain and find the `devcert` certificate. Export this as a `.cer` file.
1. In Firefox preferences, search for "**Certificates**" and open the "**View Certificates**" dialogue.
1. Go to the **Authorities** tab in the Firefox Certificate Manager window, then import the file exported in step 1.
1. Apply changes and refresh the page. The `devcert` certificate should now be trusted.

If this seems familiar, it's possible this was done previously but then the cert expired. `devcert` should be able to renew its root certificate when it expires, but when that happens the cert will need to be reimported.

## I cannot commit with GitHub Desktop. What should I do?

If you are seeing following message:

```txt
husky - command not found in PATH=/Applications/GitHub Desktop.app/Contents/Resources/app/git/libexec/git-core:/usr/bin:/bin:/usr/sbin:/sbin
```

then it's an issue with huksy working with git GUI. You can do either of the following:

- Use command line directly
- Follow [these](https://dev.to/studiospindle/using-husky-s-pre-commit-hook-with-a-gui-21ch) steps. Essentially add `.huskyrc` with file content `PATH="/usr/local/bin:$PATH"` to `~/` directory and restart GitHub Desktop.  

## I'm in a ghost signed-in state on AGSM/SMX and my content isn't loading. What should I do?

This sometimes happens because you logged into one product with one set of credentials (e.g., your AGSM dev credentials) and then switched to another product or product tier (e.g., AGSM prod or SMX). Sign out and sign back in, launch incognito, or manually clear cookies via dev tools.

---

[StoryMaps Documentation (Home)](../../README.md)

