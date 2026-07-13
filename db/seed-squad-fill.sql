-- Popula a squad JÁ EXISTENTE da pessoa (caso uma execução anterior tenha
-- criado a squad vazia). Guardado por seção — seguro re-rodar. Atômico.
DO $$
DECLARE
  v_pessoa uuid; v_squad uuid; v_cap uuid; v_repo uuid;
  v_ini1 uuid; v_ini2 uuid; v_okr uuid; v_kr1 uuid; v_kr2 uuid;
BEGIN
  SELECT id, squad_id INTO v_pessoa, v_squad
  FROM ai_workspace.pessoa WHERE lower(email) = lower('rubens.de.s.alves@hotmail.com');
  IF v_squad IS NULL THEN RAISE EXCEPTION 'Pessoa sem squad_id.'; END IF;

  SELECT id INTO v_cap FROM ai_workspace.capacidade WHERE squad_id = v_squad LIMIT 1;
  IF v_cap IS NULL THEN
    INSERT INTO ai_workspace.capacidade(squad_id, nome, descricao, sigla)
    VALUES (v_squad, 'PIX Cobranca', 'Cobrancas e recorrencias via PIX', 'PIXCOB') RETURNING id INTO v_cap;
  END IF;
  SELECT id INTO v_repo FROM ai_workspace.repositorio WHERE squad_id = v_squad LIMIT 1;
  IF v_repo IS NULL THEN
    INSERT INTO ai_workspace.repositorio(squad_id, nome) VALUES (v_squad, 'itau/pix-cobranca') RETURNING id INTO v_repo;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM ai_workspace.iniciativa WHERE squad_id = v_squad) THEN
    INSERT INTO ai_workspace.iniciativa(codigo, squad_id, capacidade_id, titulo, descricao, status, etapa_atual, criado_por)
    VALUES ('INI-401', v_squad, v_cap, 'PIX Automatico para recorrencias', 'Cobrancas recorrentes via PIX Automatico.', 'em_andamento', 3, v_pessoa) RETURNING id INTO v_ini1;
    INSERT INTO ai_workspace.iniciativa_etapa(iniciativa_id, ordem, nome, status, artefato, concluida_em) VALUES
      (v_ini1, 1, 'Descoberta', 'concluida', '{"titulo":"Brief","secoes":[{"h":"Problema","itens":["Recorrencias dependem de cartao","Churn por falha de cobranca"]}]}', now()),
      (v_ini1, 2, 'PRD', 'concluida', '{"titulo":"PRD","secoes":[{"h":"Requisitos","itens":["Autorizacao unica","Trilha de auditoria","Notificacao"]}]}', now()),
      (v_ini1, 3, 'Arquitetura', 'em_andamento', NULL, NULL),
      (v_ini1, 4, 'Historias', 'pendente', NULL, NULL),
      (v_ini1, 5, 'Desenvolvimento', 'pendente', NULL, NULL);
    INSERT INTO ai_workspace.historia(iniciativa_id, codigo, titulo, descricao, pontos, status, responsavel_id) VALUES
      (v_ini1, 'PIXCOB-101', 'Autorizacao de recorrencia', 'Consentimento do pagador', 5, 'em_dev', v_pessoa),
      (v_ini1, 'PIXCOB-102', 'Motor de agendamento', 'Agenda e dispara cobrancas', 5, 'backlog', v_pessoa),
      (v_ini1, 'PIXCOB-103', 'Trilha de auditoria', 'Registra alteracoes', 3, 'review', v_pessoa);
    INSERT INTO ai_workspace.mensagem_chat(iniciativa_id, etapa_ordem, autor, autor_nome, conteudo, tokens) VALUES
      (v_ini1, 3, 'user', 'Rubens', 'Podemos reusar o servico de consentimento do Open Finance?', 20),
      (v_ini1, 3, 'agente', 'Agente Arquiteto', 'Sim, proponho um modulo novo com eventos. Registro como ADR?', 120);

    INSERT INTO ai_workspace.iniciativa(codigo, squad_id, capacidade_id, titulo, descricao, status, etapa_atual, criado_por)
    VALUES ('INI-388', v_squad, v_cap, 'Split de pagamento para marketplaces', 'Divisao automatica entre vendedores.', 'concluida', 5, v_pessoa) RETURNING id INTO v_ini2;
    INSERT INTO ai_workspace.iniciativa_etapa(iniciativa_id, ordem, nome, status, concluida_em) VALUES
      (v_ini2, 1, 'Descoberta', 'concluida', now()), (v_ini2, 2, 'PRD', 'concluida', now()),
      (v_ini2, 3, 'Arquitetura', 'concluida', now()), (v_ini2, 4, 'Historias', 'concluida', now()),
      (v_ini2, 5, 'Desenvolvimento', 'concluida', now());
    INSERT INTO ai_workspace.historia(iniciativa_id, codigo, titulo, pontos, status, responsavel_id) VALUES
      (v_ini2, 'PIXCOB-090', 'Regras de split', 3, 'concluida', v_pessoa),
      (v_ini2, 'PIXCOB-091', 'Liquidacao por vendedor', 5, 'concluida', v_pessoa);

    INSERT INTO ai_workspace.execucao_esteira(squad_id, iniciativa_id, repositorio, etapa, status, detalhe) VALUES
      (v_squad, v_ini1, 'itau/pix-cobranca', 'build', 'ok', 'build #128 verde'),
      (v_squad, v_ini1, 'itau/pix-cobranca', 'testes', 'ok', 'cobertura 87%'),
      (v_squad, v_ini1, 'itau/pix-cobranca', 'seguranca', 'em_execucao', 'SAST em andamento');
    INSERT INTO ai_workspace.gmud(squad_id, iniciativa_id, numero, titulo, status, risco, janela)
    VALUES (v_squad, v_ini1, 'CHG-2026-0912', 'Deploy PIX Automatico - fase 1', 'aguardando_aprovacao', 'medio', '2026-07-20 02:00 as 04:00');
    INSERT INTO ai_workspace.pull_request(repositorio_id, iniciativa_id, numero, titulo, autor_nome, status)
    VALUES (v_repo, v_ini1, 42, 'feat: consentimento de recorrencia', 'Agente Dev', 'aberto');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM ai_workspace.okr WHERE squad_id = v_squad) THEN
    SELECT id INTO v_ini1 FROM ai_workspace.iniciativa WHERE squad_id = v_squad AND codigo = 'INI-401' LIMIT 1;
    INSERT INTO ai_workspace.okr(escopo, squad_id, objetivo, dono, trimestre)
    VALUES ('squad', v_squad, 'Elevar a adesao ao PIX Automatico', 'Rubens', '2026-Q3') RETURNING id INTO v_okr;
    INSERT INTO ai_workspace.key_result(okr_id, ordem, descricao, unidade, baseline, meta, invertido)
    VALUES (v_okr, 1, 'Percentual de recorrencias migradas para PIX Automatico', '%', 5, 40, false) RETURNING id INTO v_kr1;
    INSERT INTO ai_workspace.key_result(okr_id, ordem, descricao, unidade, baseline, meta, invertido)
    VALUES (v_okr, 2, 'Custo medio por transacao (centavos)', 'numero', 12, 7, true) RETURNING id INTO v_kr2;
    INSERT INTO ai_workspace.kr_medicao(kr_id, mes, planejado, realizado) VALUES
      (v_kr1, '2026-07', 12, 10), (v_kr1, '2026-08', 22, NULL), (v_kr1, '2026-09', 40, NULL),
      (v_kr2, '2026-07', 11, 11), (v_kr2, '2026-08', 9, NULL), (v_kr2, '2026-09', 7, NULL);
    IF v_ini1 IS NOT NULL THEN
      INSERT INTO ai_workspace.kr_feature(kr_id, iniciativa_id) VALUES (v_kr1, v_ini1);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM ai_workspace.documento WHERE squad_id = v_squad) THEN
    SELECT id INTO v_ini1 FROM ai_workspace.iniciativa WHERE squad_id = v_squad AND codigo = 'INI-401' LIMIT 1;
    INSERT INTO ai_workspace.documento(squad_id, iniciativa_id, titulo, tipo, resumo, conteudo, autor_nome, escopo) VALUES
      (v_squad, v_ini1, 'PRD - PIX Automatico', 'prd', 'Requisitos do PIX Automatico', E'# PRD\n\nRequisitos e criterios de aceite.', 'Agente PM', 'squad'),
      (v_squad, v_ini1, 'ADR - Reuso do servico de consentimento', 'adr', 'Decisao de arquitetura', E'# ADR\n\nReusar o servico existente com modulo novo.', 'Agente Arquiteto', 'squad');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM ai_workspace.kb_artigo WHERE squad_id = v_squad) THEN
    INSERT INTO ai_workspace.kb_artigo(escopo, squad_id, titulo, resumo, conteudo, autor_id, autor_nome)
    VALUES ('squad', v_squad, 'Padrao de idempotencia em cobrancas', 'Idempotencia ponta a ponta', E'# Idempotencia\n\nUse chave de idempotencia por operacao...', v_pessoa, 'Rubens');
  END IF;
END $$;
