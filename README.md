# Mask - Protect Sensitive Code

A VS Code extension that helps protect sensitive information in your code by making specific sections masked. When someone tries to copy marked sections, they are automatically replaced with configurable placeholder text.

## Features

- 🔒 Mark specific code sections as masked
- 🔄 Automatically replaces sensitive content with customizable placeholder text
- 🎨 Visual highlighting of protected sections
- ⌨️ Convenient keyboard shortcuts
- 🛠️ Configurable replacement text and highlighting color

## Usage

1. **Mark Text as Masked:**
   - Select the sensitive text
   - Use `Cmd+K Cmd+M` (Mac) or `Ctrl+K Ctrl+M` (Windows/Linux)
   - Or right-click and select "Mark as Masked"

2. **Remove Mask:**
   - Select the marked text
   - Use `Cmd+K Cmd+U` (Mac) or `Ctrl+K Ctrl+U` (Windows/Linux)
   - Or right-click and select "Remove Mask"

3. **Copying Behavior:**
   - When copying marked text, it will be automatically replaced with your configured placeholder text
   - Unmarked portions of the selection remain unchanged

## Configuration

You can customize the extension through VS Code settings:

- `mask.replacementText`: Text to show when copying masked code (default: "[***]")
- `mask.decorationColor`: Background color for masked code regions (default: light red)

## Examples

```javascript
const config = {
    apiKey: "abc123def456",  // Mark this as masked
    url: "https://api.example.com",
    secret: "mysecret789"    // Mark this as masked
};
```

When copying the entire config object, the output will be:
```javascript
const config = {
    apiKey: "[API_KEY]",
    url: "https://api.example.com",
    secret: "[***]"
};
```

## Installation

1. Open VS Code
2. Press `Cmd+P` (Mac) or `Ctrl+P` (Windows/Linux)
3. Type `ext install mask`
4. Press Enter

## Requirements

- VS Code version 1.96.0 or higher

## Extension Settings

This extension contributes the following settings:

* `mask.replacementText`: Text to show when copying masked code
* `mask.decorationColor`: Background color for masked code regions

## Known Issues

Please report issues on our [GitHub repository](https://github.com/rbnnghs/mask/issues).

## Release Notes

### 0.0.1

Initial release of Mask:
- Basic functionality for marking text as masked
- Custom replacement text support
- Visual highlighting
- Keyboard shortcuts

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under the [MIT License](LICENSE).
