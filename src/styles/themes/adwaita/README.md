# Adwaita read-only built-in document theme

This directory is part of the Nota installation. Do not create, edit or delete
files here. `theme.css` and `dark.css` are read-only built-in themes, and
same-named files in the user directory cannot override them.

## User document theme location

Document themes control editor content only. Interface styles are a separate
theme axis and use the `themes/ui/` directory.

### Linux and other XDG Unix-like systems

Default location:

```text
~/.config/nota/themes/document/
```

When `XDG_CONFIG_HOME` is set:

```text
$XDG_CONFIG_HOME/nota/themes/document/
```

### macOS

```text
~/Library/Application Support/nota/themes/document/
```

### Windows

```text
%APPDATA%\nota\themes\document\
```

This normally expands to:

```text
C:\Users\<user>\AppData\Roaming\nota\themes\document\
```

## User theme format

User theme IDs use ASCII letters, digits, `-` and `_`. For example:

```text
my-theme.css
```

CSS may reference assets in the same directory or the theme root with relative
paths:

```css
@font-face {
  font-family: "My Theme";
  src: url("./assets/fonts/theme.ttf");
}

:root {
  --doc-bg: #ffffff;
  --doc-fg: #222222;
  --font-doc: "My Theme", serif;
}
```

Use `/` in CSS paths on every platform or a correctly escaped relative URL. Do
not hard-code local absolute paths such as `C:\...`. Third-party fonts and other
assets must include their license beside the asset.

`adwaita` and `adwaita-dark` are reserved IDs. User themes cannot override them.
Interface styles belong in `themes/ui/`, not `themes/document/`.
