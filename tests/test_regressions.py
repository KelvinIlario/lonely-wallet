"""Regression tests for Lonely Wallet 4.3.1 security, financial and API fixes."""
import os
import tempfile
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
from pathlib import Path

ROOT = Path(tempfile.mkdtemp(prefix='lonely-wallet-tests-'))
os.environ['ASSETS_DB_PATH'] = str(ROOT / 'ativos.db')
os.environ['DB_PATH'] = str(ROOT / 'legacy.db')
os.environ['TOKEN_DB_PATH'] = str(ROOT / 'tokens.db')
os.environ['SESSION_SECRET_FILE'] = str(ROOT / '.session.key')
os.environ['API_KEYS_KEY_FILE'] = str(ROOT / '.api.key')

from app import main as wallet  # noqa: E402


class RegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        wallet.prepare_database_files()
        wallet.init_db()

    def setUp(self):
        self.client = wallet.app.test_client()
        with wallet.app.app_context():
            con = wallet.token_db()
            con.execute('DELETE FROM app_auth')
            con.execute('DELETE FROM auth_attempts')
            con.commit()

    def test_health_endpoint(self):
        response = self.client.get('/api/health')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()['ok'])

    def test_non_finite_operation_values_rejected(self):
        with wallet.app.test_request_context('/'):
            for value in ('NaN', 'Infinity', '-Infinity'):
                payload = {
                    'ticker': 'PETR4', 'tipo': 'acao', 'lado': 'compra',
                    'quantidade': value, 'preco': '10', 'custos': '0',
                    'data': '2026-01-02'
                }
                result, error = wallet.valid_operation(payload)
                self.assertIsNone(result)
                self.assertIsNotNone(error)

    def test_disable_pin_has_shared_lockout(self):
        salt = '11' * 16
        digest = wallet.pin_digest('123456', salt)
        with wallet.app.app_context():
            con = wallet.token_db()
            con.execute(
                'INSERT INTO app_auth(id,pin_salt,pin_hash,failed_attempts,locked_until,updated_at,enabled) VALUES(1,?,?,0,0,?,1)',
                (salt, digest, '2026-01-01T00:00:00')
            )
            con.commit()
        statuses = []
        for _ in range(5):
            response = self.client.post('/api/auth/disable', json={'pin': '000000'})
            statuses.append(response.status_code)
        self.assertEqual(statuses[-1], 429)
        response = self.client.post('/api/auth/disable', json={'pin': '123456'})
        self.assertEqual(response.status_code, 429)


    def test_pin_lockout_is_scoped_to_client_ip(self):
        salt = '22' * 16
        digest = wallet.pin_digest('123456', salt)
        with wallet.app.app_context():
            con = wallet.token_db()
            con.execute(
                'INSERT INTO app_auth(id,pin_salt,pin_hash,failed_attempts,locked_until,updated_at,enabled) VALUES(1,?,?,0,0,?,1)',
                (salt, digest, '2026-01-01T00:00:00')
            )
            con.commit()
        for _ in range(5):
            self.client.post('/api/auth/login', json={'pin':'000000'})
        response = self.client.post('/api/auth/login', json={'pin':'123456'}, environ_base={'REMOTE_ADDR':'192.0.2.44'})
        self.assertEqual(response.status_code, 200)

    def test_cross_origin_auth_post_rejected(self):
        response = self.client.post(
            '/api/auth/disable', json={'pin': '123456'},
            headers={'Origin': 'https://attacker.example'}
        )
        self.assertEqual(response.status_code, 403)

    def test_non_finite_values_rejected_by_financial_endpoints(self):
        cases = [
            ('/api/proventos', {'ticker':'TEST4','valor_total':'Infinity','data':'2026-01-02'}),
            ('/api/metas', {'nome':'Teste','objetivo':'NaN','aporte':'0','tipo':'patrimonio'}),
            ('/api/irpf/lancamentos', {'grupo':'isento','natureza':'Teste','fonte_pagadora':'Teste','valor':'Infinity','data':'2026-01-02'}),
            ('/api/darfs', {'competencia':'2026-01','codigo':'6015','valor':'Infinity','vencimento':'2026-02-20','status':'pendente'}),
        ]
        for url, payload in cases:
            with self.subTest(url=url):
                response = self.client.post(url, json=payload)
                self.assertEqual(response.status_code, 400)

    def test_imported_balance_asset_can_be_sold(self):
        with wallet.app.app_context():
            con = wallet.db()
            con.execute('DELETE FROM saldos_importados WHERE ticker=?', ('BASEONLY4',))
            con.execute('INSERT INTO saldos_importados(ticker,tipo,quantidade,preco_medio,preco_base,data_base,nome,origem) VALUES(?,?,?,?,?,?,?,?)',
                        ('BASEONLY4','acao',10,20,20,'2026-01-01','Base only','Teste'))
            con.commit()
        with wallet.app.test_request_context('/'):
            result, error = wallet.valid_operation({'ticker':'BASEONLY4','tipo':'acao','lado':'venda',
                'quantidade':'2','preco':'25','custos':'0','data':'2026-02-01'})
            self.assertIsNone(error)
            self.assertIsNotNone(result)


    def test_pluggy_sync_interval_is_persisted_between_requests(self):
        saved = self.client.post('/api/pluggy/settings', json={'interval_minutes': 60})
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.get_json()['interval_minutes'], 60)
        loaded = self.client.get('/api/pluggy/settings')
        self.assertEqual(loaded.status_code, 200)
        self.assertEqual(loaded.get_json()['interval_minutes'], 60)
        with wallet.app.app_context():
            con = wallet.db()
            con.execute("UPDATE app_settings SET value='30' WHERE key='pluggy_sync_interval'")
            con.execute("DELETE FROM app_settings WHERE key='pluggy_auto_sync_last_attempt'")
            con.commit()

    def test_daily_change_can_be_derived_from_same_provider_previous_close(self):
        quote = {'regularMarketPrice': 105.0, 'regularMarketPreviousClose': 100.0}
        normalized = wallet._derive_daily_change_from_quote(quote)
        self.assertEqual(normalized['regularMarketChangePercent'], 5.0)

    def test_daily_change_derivation_does_not_overwrite_provider_value(self):
        quote = {'regularMarketPrice': 105.0, 'regularMarketPreviousClose': 100.0,
                 'regularMarketChangePercent': 4.5}
        normalized = wallet._derive_daily_change_from_quote(quote)
        self.assertEqual(normalized['regularMarketChangePercent'], 4.5)

    def test_daily_market_change_uses_daily_quote_and_rejects_stale_data(self):
        percent, amount = wallet._daily_market_change(105, 5)
        self.assertEqual(percent, 5.0)
        self.assertEqual(amount, 5.0)
        self.assertEqual(wallet._daily_market_change(105, 5, stale=True), (None, None))
        self.assertEqual(wallet._daily_market_change(105, -100), (None, None))
        self.assertEqual(wallet._daily_market_change(102.5, '2,5%')[0], 2.5)

    def test_brapi_amortization_is_not_normalized_as_dividend(self):
        self.assertEqual(wallet._normalize_api_income_event_type('AMORTIZAÇÃO', 'fii'), 'AMORTIZACAO')
        self.assertEqual(wallet._normalize_api_income_event_type('RENDIMENTO', 'fii'), 'RENDIMENTO')
        self.assertEqual(wallet._normalize_api_income_event_type('JCP', 'stock'), 'JCP')
        self.assertFalse(wallet._is_income_event('AMORTIZACAO'))

    def test_hgbrasil_quote_uses_documented_stock_price_endpoint(self):
        class FakeResponse:
            def raise_for_status(self):
                return None
            def json(self):
                return {'valid_key': True, 'results': {'HGLG11': {
                    'symbol': 'HGLG11', 'name': 'FII HGLG', 'price': 160.0,
                    'change_percent': 0.25
                }}}

        with patch.object(wallet, '_get_api_token', side_effect=lambda provider: 'test-key' if provider == 'hgbrasil' else ''), \
             patch.object(wallet.requests, 'get', return_value=FakeResponse()) as request:
            quote = wallet._fallback_market_quote('HGLG11', require_daily_change=True)
        self.assertEqual(request.call_args.args[0], 'https://api.hgbrasil.com/finance/stock_price')
        self.assertEqual(request.call_args.kwargs['params'], {'key': 'test-key', 'symbol': 'HGLG11'})
        self.assertEqual(quote['regularMarketPrice'], 160.0)
        self.assertEqual(quote['regularMarketChangePercent'], 0.25)


    def test_twelve_data_fallback_uses_bvmf_mic_for_b3_assets(self):
        class FakeResponse:
            def raise_for_status(self):
                return None
            def json(self):
                return {'symbol': 'PETR4', 'close': '38.20', 'percent_change': '1.25', 'status': 'ok'}
        with patch.object(wallet, '_get_api_token', side_effect=lambda provider: 'td-key' if provider == 'twelvedata' else ''), \
             patch.object(wallet.requests, 'get', return_value=FakeResponse()) as request:
            quote = wallet._fallback_market_quote('PETR4', require_daily_change=True)
        self.assertEqual(request.call_args.args[0], 'https://api.twelvedata.com/quote')
        self.assertEqual(request.call_args.kwargs['params'], {'symbol': 'PETR4', 'mic_code': 'BVMF', 'apikey': 'td-key'})
        self.assertEqual(quote['regularMarketChangePercent'], 1.25)

    def test_twelve_data_fallback_derives_change_from_previous_close(self):
        class FakeResponse:
            def raise_for_status(self):
                return None
            def json(self):
                return {'symbol': 'PETR4', 'close': '105.00', 'previous_close': '100.00', 'status': 'ok'}
        with patch.object(wallet, '_get_api_token', side_effect=lambda provider: 'td-key' if provider == 'twelvedata' else ''), \
             patch.object(wallet.requests, 'get', return_value=FakeResponse()):
            quote = wallet._fallback_market_quote('PETR4', require_daily_change=True)
        self.assertEqual(quote['regularMarketChangePercent'], 5.0)

    def test_alpha_vantage_fallback_adds_sa_only_for_b3_assets(self):
        class FakeResponse:
            def raise_for_status(self):
                return None
            def json(self):
                return {'Global Quote': {'05. price': '38.20', '10. change percent': '1.25%'}}
        with patch.object(wallet, '_get_api_token', side_effect=lambda provider: 'alpha-key' if provider == 'alphavantage' else ''), \
             patch.object(wallet.requests, 'get', return_value=FakeResponse()) as request:
            quote = wallet._fallback_market_quote('PETR4', require_daily_change=True)
        self.assertEqual(request.call_args.kwargs['params']['symbol'], 'PETR4.SA')
        self.assertEqual(quote['regularMarketChangePercent'], 1.25)

    def test_alpha_vantage_fallback_derives_change_from_previous_close(self):
        class FakeResponse:
            def raise_for_status(self):
                return None
            def json(self):
                return {'Global Quote': {'05. price': '105.00', '08. previous close': '100.00'}}
        with patch.object(wallet, '_get_api_token', side_effect=lambda provider: 'alpha-key' if provider == 'alphavantage' else ''), \
             patch.object(wallet.requests, 'get', return_value=FakeResponse()):
            quote = wallet._fallback_market_quote('IBM', require_daily_change=True)
        self.assertEqual(quote['regularMarketChangePercent'], 5.0)

    def test_quote_uses_fallback_when_primary_price_has_no_daily_change(self):
        class FakeResponse:
            def __init__(self, payload):
                self.payload = payload
            def raise_for_status(self):
                return None
            def json(self):
                return self.payload

        brapi = FakeResponse({'results': [{'regularMarketPrice': 150.0, 'longName': 'FII HGLG'}]})
        hg = FakeResponse({'valid_key': True, 'results': {'HGLG11': {
            'symbol': 'HGLG11', 'name': 'FII HGLG', 'price': 151.0,
            'change_percent': 0.42
        }}})
        wallet.CACHE.pop('HGLG11', None)
        with patch.object(wallet, '_brapi_token', return_value=''), \
             patch.object(wallet, '_get_api_token', side_effect=lambda provider: 'test-key' if provider == 'hgbrasil' else ''), \
             patch.object(wallet.requests, 'get', side_effect=[brapi, hg]), \
             patch.object(wallet, '_enrich_quote_fundamentals', side_effect=lambda ticker, quote: quote), \
             patch.object(wallet, '_save_last_valid_quote'):
            quote = wallet.cotacao('HGLG11', force_refresh=True)
        self.assertEqual(quote['quoteProvider'], 'HG Brasil')
        self.assertEqual(quote['regularMarketPrice'], 151.0)
        self.assertEqual(quote['regularMarketChangePercent'], 0.42)
        wallet.CACHE.pop('HGLG11', None)

    def test_twelve_data_connection_test_uses_lightweight_price_endpoint(self):
        class FakeResponse:
            status_code = 200
            content = b'{"price":"100.00"}'
            def json(self):
                return {'price': '100.00'}
        with patch.object(wallet, '_get_api_token', return_value='test-key'), \
             patch.object(wallet.requests, 'get', return_value=FakeResponse()) as request:
            response = self.client.post('/api/integracoes/twelvedata/test', json={})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()['ok'])
        self.assertEqual(request.call_args.args[0], 'https://api.twelvedata.com/price')

    def test_alpha_vantage_connection_test_checks_quote_payload(self):
        class FakeResponse:
            status_code = 200
            content = b'{"Global Quote":{"01. symbol":"IBM","05. price":"200.00"}}'
            def json(self):
                return {'Global Quote': {'01. symbol': 'IBM', '05. price': '200.00'}}
        with patch.object(wallet, '_get_api_token', return_value='test-key'), \
             patch.object(wallet.requests, 'get', return_value=FakeResponse()) as request:
            response = self.client.post('/api/integracoes/alphavantage/test', json={})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()['ok'])
        self.assertEqual(request.call_args.kwargs['params']['symbol'], 'IBM')

    def test_twelve_data_connection_test_reports_invalid_key_even_on_http_200(self):
        class FakeResponse:
            status_code = 200
            content = b'{"code":401,"message":"Invalid API key","status":"error"}'
            def json(self):
                return {'code': '401', 'message': 'Invalid API key', 'status': 'error'}
        with patch.object(wallet, '_get_api_token', return_value='bad-key'), \
             patch.object(wallet.requests, 'get', return_value=FakeResponse()):
            response = self.client.post('/api/integracoes/twelvedata/test', json={})
        self.assertEqual(response.status_code, 400)
        self.assertIn('inválido', response.get_json()['message'].lower())

    def test_brapi_connection_test_rejects_error_payload_with_http_200(self):
        class FakeResponse:
            status_code = 200
            content = b'{"error":true,"message":"Invalid token","code":"INVALID_TOKEN"}'
            def json(self):
                return {'error': True, 'message': 'Invalid token', 'code': 'INVALID_TOKEN'}
        with patch.object(wallet, '_get_api_token', return_value='bad-key'), \
             patch.object(wallet.requests, 'get', return_value=FakeResponse()):
            response = self.client.post('/api/integracoes/brapi/test', json={})
        self.assertEqual(response.status_code, 400)
        self.assertIn('inválido', response.get_json()['message'].lower())

    def test_paid_brapi_events_are_included_in_received_proventos(self):
        ticker = 'BRAPITEST11'
        paid_date = (datetime.now(wallet.TZ).date() - timedelta(days=2)).isoformat()
        item_id = 'regression-paid-proventos-item'
        with wallet.app.app_context():
            con = wallet.db()
            con.execute('DELETE FROM proventos WHERE ticker=?', (ticker,))
            con.execute('DELETE FROM proventos_api WHERE ticker=?', (ticker,))
            con.execute('DELETE FROM pluggy_position_snapshots WHERE ticker=?', (ticker,))
            con.execute('DELETE FROM pluggy_items WHERE item_id=?', (item_id,))
            con.execute('INSERT INTO pluggy_items(item_id,label,connector_name,status,consent_expires_at,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
                        (item_id,'Teste','MeuPluggy','UPDATED','',1,datetime.now(wallet.TZ).isoformat(),datetime.now(wallet.TZ).isoformat()))
            con.execute('INSERT INTO pluggy_position_snapshots(item_id,investment_id,ticker,asset_type,quantity,amount_original,balance,snapshot_at) VALUES(?,?,?,?,?,?,?,?)',
                        (item_id,'regression-investment',ticker,'fii',10,50,55,datetime.now(wallet.TZ).isoformat()))
            con.execute('INSERT INTO proventos_api(event_key,ticker,tipo_ativo,tipo_evento,data_aprovacao,data_com,data_ex,data_pagamento,valor_por_ativo,quantidade,valor_total,status,remarks,sincronizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                        ('test-paid-'+ticker,ticker,'fii','RENDIMENTO',paid_date,paid_date,paid_date,paid_date,0.5,10,5.0,'Pago','',datetime.now(wallet.TZ).isoformat()))
            con.commit()
            rows = wallet._received_proventos_records([ticker])
            self.assertEqual(sum(row['valor_total'] for row in rows if row['origem']=='Brapi'), 5.0)
            self.assertEqual(wallet.received_proventos_by_ticker().get(ticker), 5.0)
            con.execute('DELETE FROM proventos_api WHERE ticker=?', (ticker,))
            con.execute('DELETE FROM pluggy_position_snapshots WHERE ticker=?', (ticker,))
            con.execute('DELETE FROM pluggy_items WHERE item_id=?', (item_id,))
            con.commit()

    def test_future_scheduled_sale_does_not_reserve_quantity_for_earlier_sale(self):
        ticker = 'FUTURESALE4'
        requested = (datetime.now(wallet.TZ) + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        execution = wallet.next_b3_session(requested)
        later = execution + timedelta(days=2)
        with wallet.app.app_context():
            con = wallet.db()
            con.execute('DELETE FROM operacoes WHERE ticker=?', (ticker,))
            con.execute("INSERT INTO operacoes(ticker,tipo,lado,quantidade,preco,data,custos,status,data_registro,data_execucao,detalhes) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                        (ticker,'acao','venda',6,10,later.date().isoformat(),0,'agendada',datetime.now(wallet.TZ).isoformat(timespec='minutes'),later.isoformat(timespec='minutes'),'{}'))
            con.commit()
        payload={'ticker':ticker,'tipo':'acao','lado':'venda','quantidade':'5','preco':'10','custos':'0','data':requested.date().isoformat(),'data_hora':requested.isoformat()}
        with wallet.app.test_request_context('/'):
            with patch.object(wallet, 'asset_type_for_ticker', return_value='acao'), patch.object(wallet, 'posicao', return_value=(10.0,10.0)):
                result, error=wallet.valid_operation(payload)
        with wallet.app.app_context():
            wallet.db().execute('DELETE FROM operacoes WHERE ticker=?', (ticker,))
            wallet.db().commit()
        self.assertIsNone(error)
        self.assertIsNotNone(result)

    def test_b3_rejects_non_finite_cells(self):
        for value in ('NaN', 'Infinity', '-Infinity'):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    wallet._b3_number(value)

    def test_b3_semantic_duplicate_requires_same_date_and_exact_fill(self):
        with wallet.app.app_context():
            con = wallet.db()
            con.execute("INSERT INTO operacoes(ticker,tipo,lado,quantidade,preco,data,custos,status,data_registro,data_execucao,detalhes) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                        ('SEMANTIC4','acao','compra',10,10,'2026-03-10',0,'executada','2026-03-10','2026-03-10T10:00:00-03:00','{}'))
            con.commit()
            same = {'categoria':'operacao','registro':{'ticker':'SEMANTIC4','tipo':'acao','lado':'compra','quantidade':10,'preco':10,'data':'2026-03-10'}}
            near = {'categoria':'operacao','registro':{'ticker':'SEMANTIC4','tipo':'acao','lado':'compra','quantidade':10,'preco':10,'data':'2026-03-11'}}
            self.assertIsNotNone(wallet._b3_semantic_duplicate(same))
            self.assertIsNone(wallet._b3_semantic_duplicate(near))

    def test_irpf_counts_sale_from_imported_opening_balance(self):
        with wallet.app.app_context():
            con = wallet.db()
            con.execute("DELETE FROM saldos_importados WHERE ticker=?", ('IRPFBASE4',))
            con.execute('INSERT INTO saldos_importados(ticker,tipo,quantidade,preco_medio,preco_base,data_base,nome,origem) VALUES(?,?,?,?,?,?,?,?)',
                        ('IRPFBASE4','acao',10,20,20,'2025-12-31','IRPF base','Teste'))
            con.execute("INSERT INTO operacoes(ticker,tipo,lado,quantidade,preco,data,custos,status,data_registro,data_execucao,detalhes) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                        ('IRPFBASE4','acao','venda',4,30,'2026-02-10',0,'executada','2026-02-10','2026-02-10T10:00:00-03:00','{}'))
            con.commit()
            summary = wallet.build_irpf_summary(2026)
            self.assertGreater(summary['resumo']['resultado_vendas'], 0)
            self.assertTrue(any(x['ticker']=='IRPFBASE4' and x['quantidade']==6 for x in summary['posicoes']))


if __name__ == '__main__':
    unittest.main()
