const axios = require('axios');

async function quickTest() {
    try {
        // Test health
        console.log('Testing /health...');
        const health = await axios.get('http://localhost:3008/health');
        console.log('Health:', health.data);

        // Test login
        console.log('\nTesting login...');
        const login = await axios.post('http://localhost:3008/api/auth/login', {
            phone: '081234567890',
            password: '123456',
        });
        console.log('Login response:', {
            user: login.data.user?.name,
            hasToken: !!login.data.accessToken,
        });

        const token = login.data.accessToken;

        // Test get shifts
        console.log('\nTesting GET /api/shifts...');
        const shifts = await axios.get('http://localhost:3008/api/shifts', {
            headers: { Authorization: `Bearer ${token}` },
        });
        console.log('Shifts:', shifts.data);

        console.log('\n✅ All basic tests passed!');
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
        }
    }
}

quickTest();
