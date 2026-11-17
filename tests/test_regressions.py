"""Regression tests for Lonely Wallet 4.2.x security and financial fixes."""
import os
import tempfile
import unittest
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
            # Isolamento: saldos-base são globais e alterariam o resultado de outros testes.
            data = wallet.db()
            for table in ('saldos_importados', 'operacoes', 'proventos', 'b3_importados', 'b3_import_lotes'):
                data.execute(f'DELETE FROM {table}')
            data.commit()

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

    # ---- 4.2.10 ----
    def _op(self, ticker, lado, qtd, preco, data):
        with wallet.app.app_context():
            con = wallet.db()
            con.execute("INSERT INTO operacoes(ticker,tipo,lado,quantidade,preco,data,custos,status,data_registro,data_execucao,detalhes) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                        (ticker, 'acao', lado, qtd, preco, data, 0, 'executada', data, data + 'T10:00:00-03:00', '{}'))
            con.commit()

    def test_retroactive_sale_cannot_break_later_position(self):
        self._op('RETRO4', 'compra', 10, 10, '2026-01-02')
        self._op('RETRO4', 'venda', 8, 12, '2026-03-02')
        with wallet.app.test_request_context('/'):
            # 5 cabem em 2026-02-01 (posição 10), mas deixariam -3 depois da venda de 8.
            result, error = wallet.valid_operation({'ticker': 'RETRO4', 'tipo': 'acao', 'lado': 'venda',
                                                    'quantidade': '5', 'preco': '11', 'data': '2026-02-01'})
            self.assertIsNone(result)
            self.assertIn('retroativa', error)
            result, error = wallet.valid_operation({'ticker': 'RETRO4', 'tipo': 'acao', 'lado': 'venda',
                                                    'quantidade': '2', 'preco': '11', 'data': '2026-02-01'})
            self.assertIsNone(error)

    def test_put_sale_does_not_count_itself(self):
        self._op('PUTSELF4', 'compra', 10, 10, '2026-01-02')
        self._op('PUTSELF4', 'venda', 10, 12, '2026-02-02')
        with wallet.app.app_context():
            op_id = wallet.db().execute("SELECT id FROM operacoes WHERE lado='venda' AND ticker='PUTSELF4'").fetchone()['id']
        response = self.client.put(f'/api/operacoes/{op_id}', json={'quantidade': 10, 'data': '2026-02-02'})
        self.assertEqual(response.status_code, 200, response.get_json())

    def test_b3_import_keeps_identical_fills_and_matches_preview(self):
        import io
        from openpyxl import Workbook
        wb = Workbook(); ws = wb.active
        ws.append(['Entrada/Saída', 'Data', 'Movimentação', 'Produto', 'Instituição', 'Quantidade', 'Preço unitário', 'Valor da Operação'])
        for day in ('10/11/2026', '10/11/2026', '11/11/2026'):
            ws.append(['Credito', day, 'Transferência - Liquidação', 'MXRF11 - MAXI RENDA FII', 'XP', 10, 9.6, 96.0])
        buf = io.BytesIO(); wb.save(buf)

        def send(mode):
            return self.client.post('/api/importar-b3', data={'arquivo': (io.BytesIO(buf.getvalue()), 'm.xlsx'), 'modo': mode},
                                    content_type='multipart/form-data').get_json()
        self.assertEqual(send('preview')['novos'], 3)
        self.assertEqual(send('importar')['operacoes'], 3)
        again = send('importar')
        self.assertEqual(again['operacoes'], 0)  # reimportar o mesmo arquivo não duplica

    def test_inline_handlers_never_embed_raw_values_in_quotes(self):
        import re
        html = (Path(__file__).resolve().parents[1] / 'app' / 'templates' / 'index.html').read_text(encoding='utf-8')
        offenders = re.findall(r"\bon[a-z]+=\"[^\"]*'\$\{[^\"]*\"", html)
        self.assertEqual(offenders, [])
        self.assertIn('function jsArg(', html)

    def test_safe_error_text_removes_urls(self):
        text = wallet.safe_error_text('401 for url: https://api.hgbrasil.com/finance?key=SECRET falhou')
        self.assertNotIn('SECRET', text)
        self.assertNotIn('hgbrasil', text)

    def test_predelete_backups_are_rotated(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            for i in range(15):
                (Path(tmp) / f'pre-exclusao-2026010{i:02d}').mkdir()
            wallet._prune_predelete_backups(tmp, keep=10)
            self.assertEqual(len(list(Path(tmp).glob('pre-exclusao-*'))), 10)


if __name__ == '__main__':
    unittest.main()
