-- Popula uma squad para rubens.de.s.alves@hotmail.com e o torna TECH LEAD dela.
-- Idempotente (a squad só é populada uma vez) e atômico (roda tudo ou nada).
-- Depois de rodar: rubens precisa DESLOGAR e LOGAR de novo (o papel/squad ficam
-- no cookie de sessão). A comunidade continua sendo dele (dono_id intacto).
DO $$
DECLARE
  v_pessoa uuid;
  v_com    uuid;
  v_rt     uuid;
  v_squad  uuid;
  v_cap    uuid;
  v_repo   uuid;
  v_ini1   uuid;
  v_ini2   uuid;
  v_okr    uuid;
  v_kr1    uuid;
  v_kr2    uuid;
BEGIN
  SELECT id, comunidade_id INTO v_pessoa, v_com
  FROM ai_workspace.pessoa
  WHERE lower(email) = lower('rubens.de.s.alves@hotmail.com');

  IF v_pessoa IS NULL THEN
    RAISE EXCEPTION 'Pessoa rubens.de.s.alves@hotmail.com nao encontrada — cadastre/logue primeiro.';
  END IF;

  -- Se o CTO ainda nao fez onboarding, cria a comunidade minima.
  IF v_com IS NULL THEN
    INSERT INTO ai_workspace.comunidade(nome, dono_id)
    VALUES ('Comunidade Meios de Pagamento', v_pessoa) RETURNING id INTO v_com;
    UPDATE ai_workspace.pessoa SET comunidade_id = v_com WHERE id = v_pessoa;
  END IF;

  -- Squad idempotente por nome dentro da comunidade.
  SELECT sq.id INTO v_squad
  FROM ai_workspace.squad sq
  JOIN ai_workspace.release_train rt ON rt.id = sq.release_train_id
  WHERE rt.comunidade_id = v_com AND sq.nome = 'Squad Pix Cobranca';

  IF v_squad IS NULL THEN
    SELECT id INTO v_rt FROM ai_workspace.release_train
    WHERE comunidade_id = v_com ORDER BY criado_em LIMIT 1;
    IF v_rt IS NULL THEN
      INSERT INTO ai_workspace.release_train(comunidade_id, nome)
      VALUES (v_com, 'RT Meios de Pagamento') RETURNING id INTO v_rt;
    END IF;

    INSERT INTO ai_workspace.squad(release_train_id, nome, budget_tokens_mes)
    VALUES (v_rt, 'Squad Pix Cobranca', 5000000) RETURNING id INTO v_squad;

    -- Capacidade + repositorio da squad
    INSERT INTO ai_workspace.capacidade(squad_id, nome, descricao, sigla)
    VALUES (v_squad, 'PIX Cobranca', 'Cobrancas e recorrencias via PIX', 'PIXCOB')
    RETURNING id INTO v_cap;

    INSERT INTO ai_workspace.repositorio(squad_id, nome)
    VALUES (v_squad, 'itau/pix-cobranca') RETURNING id INTO v_repo;

    -- Iniciativa 1 (em andamento, etapa 3)
    INSERT INTO ai_workspace.iniciativa(codigo, squad_id, capacidade_id, titulo, descricao, status, etapa_atual, criado_por)
    VALUES ('INI-401', v_squad, v_cap, 'PIX Automatico para recorrencias',
            'Permitir que clientes autorizem cobrancas recorrentes via PIX Automatico.',
            'em_andamento', 3, v_pessoa)
    RETURNING id INTO v_ini1;

    INSERT INTO ai_workspace.iniciativa_etapa(iniciativa_id, ordem, nome, status, artefato, concluida_em) VALUES
      (v_ini1, 1, 'Descoberta',  'concluida',    '{"titulo":"Brief","secoes":[{"h":"Problema","itens":["Recorrencias dependem de cartao","Alto churn por falha de cobranca"]}]}', now()),
      (v_ini1, 2, 'PRD',         'concluida',    '{"titulo":"PRD","secoes":[{"h":"Requisitos","itens":["Autorizacao unica do pagador","Trilha de auditoria","Notificacao a cada cobranca"]}]}', now()),
      (v_ini1, 3, 'Arquitetura', 'em_andamento', NULL, NULL),
      (v_ini1, 4, 'Historias',   'pendente',     NULL, NULL),
      (v_ini1, 5, 'Desenvolvimento', 'pendente', NULL, NULL);

    INSERT INTO ai_workspace.historia(iniciativa_id, codigo, titulo, descricao, pontos, status, responsavel_id) VALUES
      (v_ini1, 'PIXCOB-101', 'Autorizacao de recorrencia', 'Fluxo de consentimento do pagador', 5, 'em_dev',  v_pessoa),
      (v_ini1, 'PIXCOB-102', 'Motor de agendamento',       'Agenda e dispara as cobrancas',     5, 'backlog', v_pessoa),
      (v_ini1, 'PIXCOB-103', 'Trilha de auditoria',        'Registra cada alteracao',           3, 'review',  v_pessoa);

    INSERT INTO ai_workspace.mensagem_chat(iniciativa_id, etapa_ordem, autor, autor_nome, conteudo, tokens) VALUES
      (v_ini1, 3, 'user',   'Rubens',          'Podemos reusar o servico de consentimento do Open Finance?', 20),
      (v_ini1, 3, 'agente', 'Agente Arquiteto','Sim. Proponho um modulo novo no servico existente, com eventos para propagar as autorizacoes. Registro como ADR?', 120);

    -- Iniciativa 2 (concluida)
    INSERT INTO ai_workspace.iniciativa(codigo, squad_id, capacidade_id, titulo, descricao, status, etapa_atual, criado_por)
    VALUES ('INI-388', v_squad, v_cap, 'Split de pagamento para marketplaces',
            'Divisao automatica de valores entre vendedores.', 'concluida', 5, v_pessoa)
    RETURNING id INTO v_ini2;

    INSERT INTO ai_workspace.iniciativa_etapa(iniciativa_id, ordem, nome, status, concluida_em) VALUES
      (v_ini2, 1, 'Descoberta',      'concluida', now()),
      (v_ini2, 2, 'PRD',             'concluida', now()),
      (v_ini2, 3, 'Arquitetura',     'concluida', now()),
      (v_ini2, 4, 'Historias',       'concluida', now()),
      (v_ini2, 5, 'Desenvolvimento', 'concluida', now());

    INSERT INTO ai_workspace.historia(iniciativa_id, codigo, titulo, pontos, status, responsavel_id) VALUES
      (v_ini2, 'PIXCOB-090', 'Regras de split',        3, 'concluida', v_pessoa),
      (v_ini2, 'PIXCOB-091', 'Liquidacao por vendedor',5, 'concluida', v_pessoa);

    -- OKR da squad + KRs + medicoes + feature vinculada
    INSERT INTO ai_workspace.okr(escopo, squad_id, objetivo, dono, trimestre)
    VALUES ('squad', v_squad, 'Elevar a adesao ao PIX Automatico', 'Rubens', '2026-Q3')
    RETURNING id INTO v_okr;

    INSERT INTO ai_workspace.key_result(okr_id, ordem, descricao, unidade, baseline, meta, invertido)
    VALUES (v_okr, 1, 'Percentual de recorrencias migradas para PIX Automatico', '%', 5, 40, false)
    RETURNING id INTO v_kr1;
    INSERT INTO ai_workspace.key_result(okr_id, ordem, descricao, unidade, baseline, meta, invertido)
    VALUES (v_okr, 2, 'Custo medio por transacao (centavos)', 'numero', 12, 7, true)
    RETURNING id INTO v_kr2;

    INSERT INTO ai_workspace.kr_medicao(kr_id, mes, planejado, realizado) VALUES
      (v_kr1, '2026-07', 12, 10),
      (v_kr1, '2026-08', 22, NULL),
      (v_kr1, '2026-09', 40, NULL),
      (v_kr2, '2026-07', 11, 11),
      (v_kr2, '2026-08',  9, NULL),
      (v_kr2, '2026-09',  7, NULL);

    INSERT INTO ai_workspace.kr_feature(kr_id, iniciativa_id) VALUES (v_kr1, v_ini1);

    -- Esteira + GMUD + Pull Request
    INSERT INTO ai_workspace.execucao_esteira(squad_id, iniciativa_id, repositorio, etapa, status, detalhe) VALUES
      (v_squad, v_ini1, 'itau/pix-cobranca', 'build',     'ok',          'build #128 verde'),
      (v_squad, v_ini1, 'itau/pix-cobranca', 'testes',    'ok',          'cobertura 87%'),
      (v_squad, v_ini1, 'itau/pix-cobranca', 'seguranca', 'em_execucao', 'SAST em andamento');

    INSERT INTO ai_workspace.gmud(squad_id, iniciativa_id, numero, titulo, status, risco, janela)
    VALUES (v_squad, v_ini1, 'CHG-2026-0912', 'Deploy PIX Automatico - fase 1', 'aguardando_aprovacao', 'medio', '2026-07-20 02:00 as 04:00');

    INSERT INTO ai_workspace.pull_request(repositorio_id, iniciativa_id, numero, titulo, autor_nome, status)
    VALUES (v_repo, v_ini1, 42, 'feat: consentimento de recorrencia', 'Agente Dev', 'aberto');

    -- Documentos + KB
    INSERT INTO ai_workspace.documento(squad_id, iniciativa_id, titulo, tipo, emoji, resumo, conteudo, autor_nome, escopo) VALUES
      (v_squad, v_ini1, 'PRD - PIX Automatico', 'prd', '📄', 'Requisitos do PIX Automatico', E'# PRD\n\nRequisitos funcionais e criterios de aceite.', 'Agente PM', 'squad'),
      (v_squad, v_ini1, 'ADR - Reuso do servico de consentimento', 'adr', '🏛️', 'Decisao de arquitetura', E'# ADR\n\nReusar o servico existente com um modulo novo, propagando por eventos.', 'Agente Arquiteto', 'squad');

    INSERT INTO ai_workspace.kb_artigo(escopo, squad_id, titulo, resumo, conteudo, autor_id, autor_nome)
    VALUES ('squad', v_squad, 'Padrao de idempotencia em cobrancas', 'Como garantir idempotencia ponta a ponta',
            E'# Idempotencia\n\nUse uma chave de idempotencia por operacao e persista o resultado...', v_pessoa, 'Rubens');

    RAISE NOTICE 'Squad populada com sucesso: %', v_squad;
  ELSE
    RAISE NOTICE 'Squad ja existia (%); apenas religando a pessoa.', v_squad;
  END IF;

  -- SEMPRE: rubens vira tech lead desta squad (reversivel — ver rodape).
  UPDATE ai_workspace.pessoa
  SET papel = 'tech_lead', squad_id = v_squad, onboarding_concluido = true
  WHERE id = v_pessoa;
END $$;

-- Para VOLTAR a ser CTO depois (deslogar/logar de novo apos rodar):
--   UPDATE ai_workspace.pessoa
--   SET papel = 'cto', squad_id = NULL
--   WHERE lower(email) = lower('rubens.de.s.alves@hotmail.com');
