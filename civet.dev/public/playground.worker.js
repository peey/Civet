importScripts('https://cdn.jsdelivr.net/npm/prettier@2.8.1/standalone.js');
importScripts('https://cdn.jsdelivr.net/npm/prettier@2.8.1/parser-typescript.js');
importScripts('https://cdn.jsdelivr.net/npm/shiki@0.14.7');
importScripts('/__civet.js');

onmessage = async (e) => {
  let { uid, code, prettierOutput, jsOutput } = e.data;
  const highlighter = await getHighlighter();
  const inputHtml = highlighter.codeToHtml(code, { lang: 'coffee' });

  try {
    let ast = Civet.compile(code, { ast: true });
    let tsCode = Civet.generate(ast, {});
    let jsCode = '';

    if (jsOutput) {
      // Wrap in IIFE if there's a top-level await
      const topLevelAwait = Civet.lib.gatherRecursive(ast,
        (n) => n.type === 'Await',
        Civet.lib.isFunction
      ).length > 0
      if (topLevelAwait) {
        code = 'async do\n' + code.replace(/^/gm, ' ')
        ast = Civet.compile(code, { ast: true });
      }

      // Convert console to civetconsole for Playground execution
      Civet.lib.gatherRecursive(ast,
        (n) => n.type === 'Identifier' && n.children?.token === "console"
      ).forEach((node) => {
        node.children.token = "civetconsole"
      })

      jsCode = Civet.generate(ast, { js: true });

      if (topLevelAwait) {
        jsCode += `.then((x)=>x!==undefined&&civetconsole.log("[EVAL] "+x))`
      }
    }

    if (prettierOutput) {
      try {
        tsCode = prettier.format(tsCode, {
          parser: 'typescript',
          plugins: prettierPlugins,
          printWidth: 50,
        });
      } catch (err) {
        console.info('Prettier error. Fallback to raw civet output', {
          tsCode,
          err,
        });
      }
    }

    const outputHtml = highlighter.codeToHtml(tsCode, { lang: 'tsx' });

    postMessage({ uid, inputHtml, outputHtml, jsCode });
  } catch (error) {
    if (Civet.isCompileError(error)) {
      console.info('Snippet compilation error!', error);

      const linesUntilError = code.split('\n').slice(0, error.line).join('\n');
      const errorLine = `${' '.repeat(error.column - 1)}^ ${error.name}`;
      const errorCode = `${linesUntilError}\n${errorLine}`;
      const outputHtml = highlighter.codeToHtml(errorCode, { lang: 'coffee' });

      postMessage({ uid, inputHtml, outputHtml, error });
    } else {
      console.error(error)
      postMessage({ uid, inputHtml, outputHtml: error.message, error });
    }
  }
};

let highlighter;
async function getHighlighter() {
  if (!highlighter) {
    highlighter = await shiki.getHighlighter({
      theme: 'one-dark-pro',
      langs: ['coffee', 'tsx'],
    });
  }

  return highlighter;
}
