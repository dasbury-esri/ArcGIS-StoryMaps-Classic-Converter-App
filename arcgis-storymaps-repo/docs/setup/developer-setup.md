# Developer Setup

<!-- omit in toc -->
## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Environment](#development-environment)
  - [Recommended Text Editor](#recommended-text-editor)
  - [VS Code: Recommended User Settings and Extensions](#vs-code-recommended-user-settings-and-extensions)
  - [Install and Setup Docker Desktop on Mac](#install-and-setup-docker-desktop-on-mac)

## Prerequisites

- [Git](https://git-scm.com/)
- [Node](https://nodejs.org/en/) version 14+ with npm ([nvm](https://github.com/creationix/nvm) is recommended)
- [Yarn](https://yarnpkg.com/en/)
- [Google Chrome](https://www.google.com/chrome/) (for testing)
- [Docker](https://www.docker.com/) see [install instructions](#install-and-setup-docker-desktop-on-mac)

**Windows users**: Before cloning this repo, be sure git is configured locally to use Unix line ending (**LF** not CRLF). Use the following commands to set this in your git bash terminal at your project folder:

```sh
git config --global core.autocrlf false
git config core.eol lf
```

> **Note**: Even if you do not do this, we enforce LF line endings in the `.gitattributes` file at the root of the repo for all text files. You can learn more about [how to configure git to handle line endings](https://docs.github.com/en/github/using-git/configuring-git-to-handle-line-endings) in GitHub's documentation.

Additionally, you can set your computer to always use Unix ending using the `--global` flag:

```sh
git config --global core.eol lf
```

<details>
<summary>More tips for EOL</summary>

If you ever need to check what your file's EOL is, you can run

```sh
cat -e <filename>
```

and CRLF will be displayed as `^M$`, and LF as `$`.

If you ever need to convert from CRLF to LF for all the files under a directory, you can use `dos2unix` (installed by running `brew install dos2unix`) ([source](https://stackoverflow.com/a/7068241/7090255)):

```sh
find ./ -type f -exec dos2unix {} \;`
```

</details>

## Development Environment

### Recommended Text Editor

[Visual Studio Code](https://code.visualstudio.com/)

### VS Code: Recommended User Settings and Extensions

Workspace-specific VS Code settings are defined in [.vscode/settings.json](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/.vscode/settings.json). We also provide a list of [recommended extensions](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/.vscode/extensions.json); VS Code should prompt you to install any missing extensions when you open this repo in the editor.

### Install and Setup Docker Desktop on Mac

**Step 1:**

Go to the below link and download the Docker Desktop application depending on the chip you use, in most cases would it be the Intel chip.

[Install Docker Desktop for Mac](https://docs.docker.com/desktop/mac/install/)

**Step 2:**

Go to your Downloads directory and double click the `Docker.dmg` file. This will open the installer, then move the docker app icon into the Applications directory.

***Note:*** While moving Docker to Applications, you should get a pop-up stating that Docker requires privileged access. Please select OK/Allow to give Docker privileged access. This will help prevent permission issues while using Docker.

**Step 3:**

Once installation is complete open the Docker app via Mac's Menu Bar or Spotlight. Go to Preferences and select General. Under the General section select the following options

> Start Docker Desktop when you log in.

> Automatically check for updates

Then go to Resources and in the Advanced section allocate resources with at least the below values.

> CPU's: 5

> Memory: 5.00 GB

> Swap: 1.00 GB or default value

> Disk image size: 50.00 GB or default value

Setting memory and CPU as above will help prevent out-of-memory issues while building docker images.

**Step 4:**

Finally, validate your installation by running the below command on your terminal.

`docker run hello-world`

If you come across permission denied errors while running the above command then please check the ownership on file `/var/run/docker.sock` by running:

`ls -la /var/run/docker.sock`

Run the below command to give the socket necessary permission:

`sudo chmod 666 /var/run/docker.sock`

---
[StoryMaps Documentation (Home)](../../README.md) | [Getting Started](./getting-started.md)
