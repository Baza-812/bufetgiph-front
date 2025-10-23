import { NextResponse } from 'next/server';

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
    const { searchParams } = new URL(req.url);
    const pollId = searchParams.get('pollId');
    if (!pollId) return NextResponse.json({ ok: false, error: 'pollId is required' }, { status: 400 });

    // Считаем агрегаты по Choice=a/b
    const filter = encodeURIComponent(`{PollId} = '${pollId}'`);
    const url = atUrl(`?filterByFormula=${filter}&fields[]=Choice&pageSize=100`);
    let a = 0, b = 0, offset: string | undefined;

    do {
      const r = await fetch(offset ? `${url}&offset=${offset}` : url, { headers });
      if (!r.ok) throw new Error(`Airtable GET failed: ${r.status}`);
      const data = await r.json();
      for (const rec of data.records || []) {
        const ch = rec.fields?.Choice;
        if (ch === 'a') a++;
        else if (ch === 'b') b++;
      }
      offset = data.offset;
    } while (offset);

    return NextResponse.json({ ok: true, a, b });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { pollId, org, employeeID, choice } = body || {};
    if (!pollId || !employeeID || !choice || !['a', 'b'].includes(choice))
      return NextResponse.json({ ok: false, error: 'pollId, employeeID and valid choice are required' }, { status: 400 });

    // Не дублируем голос сотрудника по этому pollId
    const filter = encodeURIComponent(`AND({PollId}='${pollId}', {EmployeeID}='${employeeID}')`);
    const checkUrl = atUrl(`?filterByFormula=${filter}&maxRecords=1&fields[]=id`);
    const checkResp = await fetch(checkUrl, { headers });
    if (!checkResp.ok) throw new Error(`Airtable check failed: ${checkResp.status}`);
    const checkData = await checkResp.json();
    if ((checkData.records || []).length > 0) {
      return NextResponse.json({ ok: true, alreadyVoted: true });
    }

    // Создаём запись
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
              Choice: choice,
            },
          },
        ],
        typecast: true,
      }),
    });
    if (!createResp.ok) throw new Error(`Airtable create failed: ${createResp.status}`);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? String(e) }, { status: 500 });
  }
}
