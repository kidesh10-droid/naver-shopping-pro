const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    // 회원가입
    if (action === 'signup') {
      const { email, password } = req.body || {};
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return res.status(400).json({ errorMessage: error.message });

      // users 테이블에 추가
      await supabase.from('users').upsert({
        id: data.user.id,
        email: email,
        usage_count: 0,
        is_premium: false
      });
      return res.status(200).json({ success: true, user: data.user });
    }

    // 로그인
    if (action === 'login') {
      const { email, password } = req.body || {};
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return res.status(400).json({ errorMessage: error.message });

      // 유저 정보 가져오기
      const { data: userData } = await supabase
        .from('users').select('*').eq('id', data.user.id).single();

      return res.status(200).json({ success: true, session: data.session, user: userData });
    }

    // 사용 횟수 체크 및 증가
    if (action === 'check_usage') {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ errorMessage: '로그인이 필요합니다.' });

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ errorMessage: '인증 실패.' });

      const { data: userData } = await supabase
        .from('users').select('*').eq('id', user.id).single();

      if (!userData) return res.status(404).json({ errorMessage: '유저 정보 없음.' });

      // 프리미엄 만료 체크
      if (userData.is_premium && userData.premium_expires_at) {
        if (new Date(userData.premium_expires_at) < new Date()) {
          await supabase.from('users').update({ is_premium: false }).eq('id', user.id);
          userData.is_premium = false;
        }
      }

      // 프리미엄이면 무제한
      if (userData.is_premium) {
        return res.status(200).json({ allowed: true, is_premium: true, usage_count: userData.usage_count });
      }

      // 무료 3회 체크
      const count = userData.usage_count || 0;
      if (count >= 3) {
        return res.status(200).json({ allowed: false, is_premium: false, usage_count: count });
      }

      // 사용 횟수 증가
      await supabase.from('users').update({ usage_count: count + 1 }).eq('id', user.id);
      return res.status(200).json({ allowed: true, is_premium: false, usage_count: count + 1 });
    }

    // 유저 정보 조회
    if (action === 'me') {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ errorMessage: '로그인이 필요합니다.' });
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ errorMessage: '인증 실패.' });
      const { data: userData } = await supabase.from('users').select('*').eq('id', user.id).single();
      return res.status(200).json(userData);
    }

    return res.status(400).json({ errorMessage: '잘못된 요청.' });
  } catch(e) {
    res.status(500).json({ errorMessage: e.message });
  }
};
