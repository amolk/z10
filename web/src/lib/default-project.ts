/** Default .z10.html content for new projects */
export function createDefaultContent(projectName: string): string {
  return `<html data-z10-project="${projectName}">
<head>
  <script type="application/z10+json" data-z10-role="config">
  {
    "name": "${projectName}",
    "version": "1.0.0",
    "governance": { "level": 1 }
  }
  </script>
  <style data-z10-tokens="primitives">
    :root {
      --color-white: #ffffff;
      --color-black: #000000;
      --color-gray-50: #fafafa;
      --color-gray-100: #f4f4f5;
      --color-gray-200: #e4e4e7;
      --color-gray-300: #d4d4d8;
      --color-gray-400: #a1a1aa;
      --color-gray-500: #71717a;
      --color-gray-600: #52525b;
      --color-gray-700: #3f3f46;
      --color-gray-800: #27272a;
      --color-gray-900: #18181b;
      --spacing-xs: 4px;
      --spacing-sm: 8px;
      --spacing-md: 16px;
      --spacing-lg: 24px;
      --spacing-xl: 32px;
      --size-sm: 14px;
      --size-md: 16px;
      --size-lg: 20px;
      --size-xl: 24px;
    }
  </style>
</head>
<body>
  <div data-z10-page="Page 1" data-z10-id="page_1" style="position: relative;">
    <div data-z10-id="frame_page_1" style="position: absolute; left: 0px; top: 0px; width: 1440px; height: 900px; display: flex; background-color: #ffffff; overflow: hidden;"></div>
  </div>
</body>
</html>`;
}
