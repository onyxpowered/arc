// Arc

export function wrap(compiledSource, { fontFaceCss, title = 'Arc' } = {}) {
  return [
    `<!-- ${title} -->`,
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    ...(fontFaceCss ? ['<style>', fontFaceCss, '</style>'] : []),
    '</head>',
    '<body>',
    '<script type="module">',
    compiledSource,
    '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
