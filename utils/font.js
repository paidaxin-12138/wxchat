/** UI 已改用 PNG 图标（images/icons/），不再加载 woff2 字体，避免 readFile 权限警告 */

function loadAppFonts() {
  return Promise.resolve(true);
}

module.exports = {
  loadAppFonts
};
