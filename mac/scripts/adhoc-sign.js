// Après l'assemblage : verrous internes d'Electron (« fuses »), puis signature locale (ad hoc), nécessaire pour démarrer sur puce Apple.
// Les verrous empêchent de détourner l'application pour lire les données qu'elle déchiffre avec le trousseau :
// pas de débogueur (--inspect), pas d'options Node par l'environnement (NODE_OPTIONS), code chargé seulement depuis l'archive,
// archive vérifiée à l'ouverture quand son empreinte est inscrite dans Info.plist. Le mode « Node » reste ouvert : l'IA et la dictée
// du Mac tournent dans des processus lancés ainsi (avec les mêmes verrous).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app');
  const plist = fs.readFileSync(path.join(app, 'Contents', 'Info.plist'), 'utf8'), integrite = /ElectronAsarIntegrity/.test(plist);
  await flipFuses(app, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: true,
    [FuseV1Options.RunAsNode]: true,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: integrite,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false
  });
  console.log('Verrous Electron posés' + (integrite ? ', archive vérifiée à l’ouverture' : ' (empreinte de l’archive absente de Info.plist : vérification de l’archive non activée)'));
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
