const { query } = require('./_lib/database');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { customerKey, authKey } = req.body;

        if (!customerKey || !authKey) {
            return res.status(400).json({ 
                success: false, 
                error: 'customerKey와 authKey가 필요합니다.' 
            });
        }

        // 토스페이먼츠 빌링키 발급 API 호출
        const secretKey = process.env.TOSS_SECRET_KEY;
        const encodedKey = Buffer.from(secretKey + ':').toString('base64');

        const response = await fetch('https://api.tosspayments.com/v1/billing/authorizations/issue', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + encodedKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ authKey, customerKey }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('토스 빌링키 발급 실패:', data);
            return res.status(response.status).json({ 
                success: false, 
                error: data.message || '빌링키 발급 실패' 
            });
        }

        // 빌링키 DB 저장
        await query(
            `INSERT INTO billing_keys (customer_key, billing_key, card_company, card_number)
             VALUES ($1, $2, $3, $4)`,
            [customerKey, data.billingKey, data.cardCompany || '', data.cardNumber || '']
        );

        return res.json({
            success: true,
            billingKey: data.billingKey,
            cardCompany: data.cardCompany,
            cardNumber: data.cardNumber,
        });

    } catch (error) {
        console.error('빌링키 발급 에러:', error);
        res.status(500).json({ 
            success: false, 
            error: '서버 오류가 발생했습니다' 
        });
    }
};
