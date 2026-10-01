export function installationPlatform(userAgent='',platform='',touchPoints=0){if(/iPhone|iPad|iPod/i.test(userAgent)||(platform==='MacIntel'&&touchPoints>1))return 'ios';if(/Android/i.test(userAgent))return 'android';return 'desktop'}
export function isStandalone(windowAPI=window,navigatorAPI=navigator){return !!(windowAPI.matchMedia('(display-mode: standalone)').matches||navigatorAPI.standalone)}
