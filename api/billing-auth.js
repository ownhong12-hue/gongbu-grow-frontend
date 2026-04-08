const { query } = require('./_lib/database');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type } = req.body;

  // ─────────────────────────────────────────
  // 1) 빌링키 발급 (카드 등록)
  // ─────────────────────────────────────────
  if (!type || type === 'auth') {
    try {
      const { customerKey, authKey } = req.body;

      if (!customerKey || !authKey) {
        return res.status(400).json({
          success: false,
          error: 'customerKey와 authKey가 필요합니다.',
        });
      }

      const secretKey = process.env.TOSS_SECRET_KEY;
      const encodedKey = Buffer.from(secretKey + ':').toString('base64');

      const response = await fetch(
        'https://api.tosspayments.com/v1/billing/authorizations/issue',
        {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + encodedKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ authKey, customerKey }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('토스 빌링키 발급 실패:', data);
        return res.status(response.status).json({
          success: false,
          error: data.message || '빌링키 발급 실패',
        });
      }

      await query(
        `INSERT INTO billing_keys (customer_key, billing_key, card_company, card_number)
         VALUES ($1, $2, $3, $4)`,
        [
          customerKey,
          data.billingKey,
          data.cardCompany || '',
          data.cardNumber || '',
        ]
      );

      return res.json({
        success: true,
        billingKey: data.billingKey,
        cardCompany: data.cardCompany,
        cardNumber: data.cardNumber,
      });
    } catch (error) {
      console.error('빌링키 발급 에러:', error);
      return res.status(500).json({
        success: false,
        error: '서버 오류가 발생했습니다',
      });
    }
  }

  // ─────────────────────────────────────────
  // 2) 실제 결제 요청 (월 구독료 청구)
  // ─────────────────────────────────────────
  if (type === 'charge') {
    try {
      const secretKey = process.env.TOSS_SECRET_KEY;
      const encodedKey = Buffer.from(secretKey + ':').toString('base64');

      // billing_keys 테이블에서 모든 빌링키 가져오기
      const { rows: billingKeys } = await query(
        `SELECT * FROM billing_keys ORDER BY created_at ASC`
      );

      if (billingKeys.length === 0) {
        return res.json({ success: true, message: '결제할 빌링키 없음', results: [] });
      }

      const results = [];

      for (const row of billingKeys) {
        const orderId = 'order_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

        try {
          const response = await fetch(
            `https://api.tosspayments.com/v1/billing/${row.billing_key}`,
            {
              method: 'POST',
              headers: {
                Authorization: 'Basic ' + encodedKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                customerKey: row.customer_key,
                amount: 98000,
                orderId: orderId,
                orderName: '공부.성장 코칭반 월 구독',
              }),
            }
          );

          const data = await response.json();

          if (response.ok) {
            // 결제 성공 로그 저장
            await query(
              `INSERT INTO payment_logs (customer_key, billing_key, order_id, amount, status, response)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                row.customer_key,
                row.billing_key,
                orderId,
                98000,
                'success',
                JSON.stringify(data),
              ]
            );
            results.push({ customerKey: row.customer_key, status: 'success', orderId });
          } else {
            // 결제 실패 로그 저장
            await query(
              `INSERT INTO payment_logs (customer_key, billing_key, order_id, amount, status, response)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                row.customer_key,
                row.billing_key,
                orderId,
                98000,
                'fail',
                JSON.stringify(data),
              ]
            );
            results.push({ customerKey: row.customer_key, status: 'fail', error: data.message });
          }
        } catch (err) {
          results.push({ customerKey: row.customer_key, status: 'error', error: err.message });
        }
      }

      return res.json({ success: true, results });
    } catch (error) {
      console.error('결제 요청 에러:', error);
      return res.status(500).json({
        success: false,
        error: '서버 오류가 발생했습니다',
      });
    }
  }

  return res.status(400).json({ success: false, error: '올바른 type이 필요합니다.' });
};
