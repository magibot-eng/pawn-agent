import asyncio, asyncpg, os
async def fix():
    conn_str = os.environ.get('DATABASE_URL','').replace('+asyncpg','')
    conn = await asyncpg.connect(conn_str)
    await conn.execute("UPDATE shops SET auto_settlement_enabled = true")
    shops = await conn.fetch("SELECT id, ens_name, auto_settlement_enabled FROM shops")
    print("Shops:", [dict(s) for s in shops])
    await conn.close()
asyncio.run(fix())