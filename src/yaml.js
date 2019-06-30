yaml = require('js-yaml');
fs = require('fs');

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
