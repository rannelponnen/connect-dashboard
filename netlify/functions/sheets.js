const https = require('node:https');

exports.handler = async (event) => {
  const { sheet, range } = event.queryStringParameters || {};
  const apiKey = process.env.GOOGLE_API_KEY;
  const spreadsheetId = process.env.SPREADSHEET_ID;

  if (!apiKey || !spreadsheetId) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing GOOGLE_API_KEY or SPREADSHEET_ID environment variables' }),
    };
  }

  if (!sheet || !range) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required query params: sheet, range' }),
    };
  }

  const encodedRange = encodeURIComponent(`${sheet}!${range}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?key=${apiKey}`;

  try {
    const data = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error('Failed to parse response')); }
        });
      }).on('error', reject);
    });

    if (data.error) {
      return {
        statusCode: data.error.code || 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: data.error.message }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // 5 min cache
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
