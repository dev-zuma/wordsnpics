const fs = require('fs');
const path = require('path');

const themes = [
    { name: 'weather', emoji: '☁️' },
    { name: 'music', emoji: '🎵' },
    { name: 'sports', emoji: '⚽' },
    { name: 'food', emoji: '🍕' },
    { name: 'tech', emoji: '💻' },
    { name: 'nature', emoji: '🌳' },
    { name: 'travel', emoji: '✈️' },
    { name: 'theme1', emoji: '1️⃣' },
    { name: 'theme2', emoji: '2️⃣' },
    { name: 'theme3', emoji: '3️⃣' },
    { name: 'theme4', emoji: '4️⃣' },
    { name: 'theme5', emoji: '5️⃣' },
    { name: 'theme6', emoji: '6️⃣' },
    { name: 'theme7', emoji: '7️⃣' }
];

const createSVGPlaceholder = (theme, emoji) => {
    return `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="#ECF0F1" rx="8"/>
  <rect x="10" y="10" width="80" height="80" fill="#FFFFFF" rx="4" stroke="#2C3E50" stroke-width="2"/>
  <text x="50" y="55" font-family="Arial, sans-serif" font-size="40" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
</svg>`;
};

themes.forEach(theme => {
    const svg = createSVGPlaceholder(theme.name, theme.emoji);
    const filename = path.join(__dirname, 'public', 'images', `placeholder-${theme.name}.png`);
    
    fs.writeFileSync(filename.replace('.png', '.svg'), svg);
    console.log(`Created ${filename.replace('.png', '.svg')}`);
});

console.log('All placeholder SVG images created!');