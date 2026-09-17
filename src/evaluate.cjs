'use strict';
// The supported desktop runtime does not implement webFrame.executeJavaScript.
// Use its local DevTools protocol without opening DevTools or a network port.
async function evaluate(contents, expression) {
  if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
  let timer;
  const result = await Promise.race([
    contents.debugger.sendCommand('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Local renderer evaluation timed out')), 10000);
    }),
  ]).finally(() => clearTimeout(timer));
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function applyStyle(contents, css) {
  return evaluate(
    contents,
    `(() => {
    let style=document.getElementById('companion-appearance-style');
    if (!style) { style=document.createElement('style'); style.id='companion-appearance-style'; document.head.append(style); }
    const css=${JSON.stringify(css)};
    if (style.textContent !== css) style.textContent=css;
  })()`,
  );
}
module.exports = { evaluate, applyStyle };
