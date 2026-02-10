module.exports = {
  appId: 'com.wwm.cd-overlay',
  productName: 'WWM CD Overlay',
  directories: { output: 'dist' },
  files: [
    'main/**/*',
    'preload/**/*',
    'renderer/**/*',
    'shared/**/*',
    'node_modules/**/*',
    'package.json'
  ],
  win: {
    target: ['nsis'],
    icon: 'assets/icon.ico'
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false
  }
}
