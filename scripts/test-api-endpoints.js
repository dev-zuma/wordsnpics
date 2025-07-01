#!/usr/bin/env node

/**
 * Test API Endpoints Script
 * 
 * This script tests the API endpoints directly to see if they're returning
 * the expected puzzle data
 */

const http = require('http');

function testEndpoint(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: process.env.PORT || 5000,
            path: path,
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    });
}

async function testAllEndpoints() {
    console.log('🔍 Testing API Endpoints...\n');
    
    const boardTypes = [
        'wordsnpics-daily',
        'americana', 
        'animal-kingdom',
        'historical-figures',
        'mind-benders',
        'startup',
        'the-download'
    ];
    
    // Test 1: Board Types endpoint
    console.log('📋 Testing /api/board-types:');
    try {
        const result = await testEndpoint('/api/board-types');
        console.log(`   Status: ${result.status}`);
        
        if (result.status === 200) {
            const boardTypes = JSON.parse(result.body);
            console.log(`   Board types returned: ${boardTypes.length}`);
            boardTypes.forEach(bt => {
                console.log(`   • ${bt.name} (${bt.id})`);
            });
        } else {
            console.log(`   ❌ Error: ${result.body}`);
        }
    } catch (error) {
        console.log(`   ❌ Request failed: ${error.message}`);
    }
    
    // Test 2: Daily puzzle endpoints
    console.log('\n🎮 Testing daily puzzle endpoints:');
    
    for (const boardType of boardTypes) {
        console.log(`\n   Testing /api/daily-puzzle/${boardType}:`);
        
        try {
            const result = await testEndpoint(`/api/daily-puzzle/${boardType}`);
            console.log(`   Status: ${result.status}`);
            
            if (result.status === 200) {
                const data = JSON.parse(result.body);
                
                if (data.available) {
                    console.log(`   ✅ Puzzle available!`);
                    console.log(`   Board ID: ${data.puzzle.boardId}`);
                    console.log(`   Title: ${data.puzzle.title}`);
                    console.log(`   Images: ${data.puzzle.images ? data.puzzle.images.length : 0}`);
                    console.log(`   Words: ${data.puzzle.words ? data.puzzle.words.length : 0}`);
                    
                    // Check if images have URLs
                    if (data.puzzle.images && data.puzzle.images.length > 0) {
                        console.log(`   First image URL: ${data.puzzle.images[0].url || 'NO URL'}`);
                    }
                } else {
                    console.log(`   ⏰ Not available yet`);
                    console.log(`   Message: ${data.message}`);
                    console.log(`   Release time: ${data.releaseTime}`);
                }
            } else {
                const errorData = JSON.parse(result.body);
                console.log(`   ❌ Error: ${errorData.error || result.body}`);
            }
        } catch (error) {
            console.log(`   ❌ Request failed: ${error.message}`);
        }
    }
    
    // Test 3: Demo puzzle endpoint
    console.log('\n🎯 Testing demo puzzle endpoint:');
    try {
        const result = await testEndpoint('/api/puzzle/demo?boardType=wordsnpics-daily');
        console.log(`   Status: ${result.status}`);
        
        if (result.status === 200) {
            const data = JSON.parse(result.body);
            console.log(`   ✅ Demo puzzle loaded`);
            console.log(`   Board ID: ${data.boardId}`);
            console.log(`   Images: ${data.images ? data.images.length : 0}`);
            console.log(`   Words: ${data.words ? data.words.length : 0}`);
        } else {
            console.log(`   ❌ Error: ${result.body}`);
        }
    } catch (error) {
        console.log(`   ❌ Request failed: ${error.message}`);
    }
    
    console.log('\n💡 If all endpoints return 404 or no puzzle data, check:');
    console.log('   1. Is the server running on the expected port?');
    console.log('   2. Are the routes properly registered?');
    console.log('   3. Is the database connection working?');
}

async function main() {
    console.log('🌐 WORDSNPICS API Endpoint Tester');
    console.log('==================================\n');
    
    console.log('⚠️  Make sure the server is running before running this test!\n');
    
    await testAllEndpoints();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { testAllEndpoints };