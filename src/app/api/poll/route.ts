import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_KEY = process.env.AIRTABLE_API_KEY!;
const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const TABLE = process.env.AIRTABLE_TABLE_POLL_VOTES || 'PollVotes';

function atUrl(path: string) {
  return `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}${path}`;
}
const headers = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

export async function GET(req: Request) {
  try {
    if (!API_KEY || !BASE_ID) {
      return NextResponse.json({ ok: false, error: 'Missing Airtable env' }, { status: 500 });
    }
    const { searchParams } = new URL(req.url);
    const pollId = searchParams.get('pollId');
    if (!pollId) return NextResponse.json({ ok: false, error: 'pollId is required' }, { status: 400 });

    const filter = encodeURIComponent(`{PollId} = '${pollId}'`);
    let a = 0, b = 0, offset: string | undefined;
    const baseUrl = atUrl(`?filterByFormula=${filter}&fields[]=Choice&pageSize=100`);

    do {
      const r = await fetch(offset ? `${baseUrl}&offset=${offset}` : baseUrl, { headers });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        console.error('Airtable GET failed:', r.status, txt);
        throw new Error(`Airtable GET ${r.status}`);
      }
      const data: any = await r.json();
      for (const rec of data.records || []) {
        if (rec.fields?.Choice === 'a') a++;
        else if (rec.fields?.Choice === 'b') b++;
      }
      offset = data.offset;
    } while (offset);

    return NextResponse.json({ ok: true, a, b });
  } catch (e: any) {
    console.error('GET /api/poll error:', e);
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!API_KEY || !BASE_ID) {
      return NextResponse.json({ ok: false, error: 'Missing Airtable env' }, { status: 500 });
    }
    const body = await req.json().catch(() => ({}));
    const { pollId, org, employeeID, choice } = body || {};
    if (!pollId || !employeeID || !choice || !['a', 'b'].includes(choice)) {
      return NextResponse.json(
        { ok: false, error: 'pollId, employeeID and valid choice (a|b) are required' },
        { status: 400 }
      );
    }

    // безопасная обёртка в двойные кавычки
    const dq = (v: string) => `"${String(v).replace(/"/g, '\\"')}"`;

    // ✔️ ПРОВЕРКА: голосовал ли уже этот employeeID для этого pollId
    const filterFormula = encodeURIComponent(
      `AND({PollId} = ${dq(pollId)}, {EmployeeID} = ${dq(employeeID)})`
    );
    // ❌ БЫЛО: &fields[]=id — это вызывало 422, убираем
    const checkUrl = atUrl(`?filterByFormula=${filterFormula}&maxRecords=1`);
    const checkResp = await fetch(checkUrl, { headers });
    const checkText = await checkResp.text().catch(() => '');
    if (!checkResp.ok) {
      console.error('Airtable check failed:', checkResp.status, checkText);
      return NextResponse.json(
        { ok: false, error: `Airtable check ${checkResp.status}`, data: checkText },
        { status: 500 }
      );
    }
    const checkData: any = checkText ? JSON.parse(checkText) : { records: [] };
    if ((checkData.records || []).length > 0) {
      return NextResponse.json({ ok: true, alreadyVoted: true });
    }

    // ✔️ СОЗДАНИЕ ЗАПИСИ (Choice — текстовое поле)
    const createResp = await fetch(atUrl(''), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        records: [
          {
            fields: {
              PollId: pollId,
              Org: org || '',
              EmployeeID: employeeID,
              Choice: choice, // текстовое поле (Single line text)
            },
          },
        ],
        // typecast: true, // не нужно, оставляем выключенным
      }),
    });
    const createText = await createResp.text().catch(() => '');
    if (!createResp.ok) {
      console.error('Airtable create failed:', createResp.status, createText);
      return NextResponse.json(
        { ok: false, error: `Airtable create ${createResp.status}`, data: createText },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('POST /api/poll error:', e);
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

