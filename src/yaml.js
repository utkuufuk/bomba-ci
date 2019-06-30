const yaml = require('js-yaml');
const fs = require('fs');

module.exports = {
    load: (path) => {
        try {
            const file = fs.readFileSync(path, 'utf8');
            return yaml.safeLoad(file);
        } catch (err) {
            console.error(err);
        }
    }
};
