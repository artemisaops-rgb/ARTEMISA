const fs = require('fs');
try {
    const content = fs.readFileSync('firebase_apps_new.json', 'utf8'); // Try utf8 first
    // Remove BOM if present
    const cleanContent = content.replace(/^\uFEFF/, '');
    const apps = JSON.parse(cleanContent);
    const app = apps.result.find(a => a.displayName === 'Artemisa Fresh');
    if (app) {
        console.log(app.appId);
    } else {
        console.error('App not found');
    }
} catch (e) {
    // If utf8 fails, try reading as utf16le (PowerShell default for >)
    try {
        const content = fs.readFileSync('firebase_apps_new.json', 'utf16le');
        const apps = JSON.parse(content);
        const app = apps.result.find(a => a.displayName === 'Artemisa Fresh');
        if (app) {
            console.log(app.appId);
        } else {
            console.error('App not found in utf16le');
        }
    } catch (e2) {
        console.error(e2);
    }
}
