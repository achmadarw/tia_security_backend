const http = require('http');

// Test roster patterns API endpoint
http.get('http://localhost:3008/api/roster-patterns', (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('✅ API Response:');
            console.log(JSON.stringify(json, null, 2));

            if (json.data && json.data.length > 0) {
                console.log(`\n✅ Found ${json.data.length} patterns:`);
                json.data.forEach((p) => {
                    console.log(
                        `  - ${p.name} (${p.personil_count} personil)${
                            p.is_default ? ' ⭐' : ''
                        }`
                    );
                });
            }
        } catch (e) {
            console.error('❌ Parse error:', e);
            console.log('Raw response:', data);
        }
    });
}).on('error', (e) => {
    console.error('❌ Request error:', e.message);
});
