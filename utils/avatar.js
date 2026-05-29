/** 头像 URL 处理：云存储应存 fileID，勿存会过期的临时 HTTPS 链接 */

function isCloudFileId(url) {
  return !!url && url.indexOf('cloud://') === 0;
}

function isSignedCloudTempUrl(url) {
  return (
    !!url &&
    url.indexOf('https://') === 0 &&
    (url.indexOf('tcb.qcloud.la') >= 0 || url.indexOf('myqcloud.com') >= 0)
  );
}

/** 转为可展示的 src（过期临时链返回空，走默认头像） */
function resolveAvatarDisplay(avatarUrl) {
  if (!avatarUrl) return '';
  if (isCloudFileId(avatarUrl)) return avatarUrl;
  if (avatarUrl.indexOf('wxfile://') === 0) return avatarUrl;
  if (isSignedCloudTempUrl(avatarUrl)) return '';
  return avatarUrl;
}

module.exports = {
  isCloudFileId,
  isSignedCloudTempUrl,
  resolveAvatarDisplay
};
