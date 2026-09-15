const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const MAX_DIMENSION = 1200;
const QUALITY = 62;

async function getImageStats() {
    const files = fs.readdirSync(UPLOAD_DIR)
        .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
        .map(f => ({
            name: f,
            size: fs.statSync(path.join(UPLOAD_DIR, f)).size,
            ext: path.extname(f).toLowerCase()
        }))
        .sort((a, b) => b.size - a.size);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    return { files, totalSize, count: files.length };
}

async function optimizeImage(file) {
    const inputPath = path.join(UPLOAD_DIR, file.name);
    const baseName = path.parse(file.name).name;
    const outputPath = path.join(UPLOAD_DIR, baseName + '.webp');

    try {
        const buffer = fs.readFileSync(inputPath);
        const image = sharp(buffer);
        const metadata = await image.metadata();

        const targetWidth = metadata.width > MAX_DIMENSION ? MAX_DIMENSION : metadata.width;
        const targetHeight = metadata.height > MAX_DIMENSION ? MAX_DIMENSION : metadata.height;

        const optimizedBuffer = await sharp(buffer)
            .resize({ width: targetWidth, height: targetHeight, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: QUALITY, effort: 6 })
            .toBuffer();

        const outputSize = optimizedBuffer.length;

        if (outputSize < file.size) {
            fs.writeFileSync(outputPath, optimizedBuffer);
            fs.unlinkSync(inputPath);
            return { optimized: true, originalSize: file.size, newSize: outputSize };
        }
        return { skipped: true, reason: 'no_improvement' };
    } catch (err) {
        return { error: err.message };
    }
}

async function main() {
    console.log('Kep optimalizalo script inditasa...\n');
    const { files, totalSize, count } = await getImageStats();
    const totalMB = (totalSize / 1024 / 1024).toFixed(2);
    console.log('Statisztika:', { count, totalMB });
    
    let optimized = 0, skipped = 0, errors = 0, savedBytes = 0;
    const errorsList = [];

    for (const file of files) {
        const result = await optimizeImage(file);
        if (result.optimized) {
            optimized++;
            savedBytes += result.originalSize - result.newSize;
            console.log('OK:', file.name, '-', (result.originalSize/1024).toFixed(0)+'KB -> '+(result.newSize/1024).toFixed(0)+'KB');
        } else if (result.skipped) {
            skipped++;
        } else if (result.error) {
            errors++;
            errorsList.push(file.name + ': ' + result.error);
            console.log('HIBA:', file.name, '-', result.error);
        }
    }

    console.log('\nOSSZESITES:');
    console.log('Optimalizalva:', optimized);
    console.log('Kihagyva:', skipped);
    console.log('Hibak:', errors);
    console.log('Megtakaritas:', (savedBytes/1024/1024).toFixed(2), 'MB');
    if (errorsList.length > 0) {
        console.log('\nHIBAS FAJLOK:');
        errorsList.forEach(f => console.log('  -', f));
    }
}

main().catch(console.error);
