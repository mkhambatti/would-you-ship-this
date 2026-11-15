# One command from a clean clone to the shipped bundle:  make reproduce
PY := .venv/bin/python

.PHONY: reproduce venv fetch run bundle test serve e2e captures

reproduce: venv fetch run bundle test
	@echo "Done. Compare with git:  git status --short results site/data"

venv:
	test -d .venv || python3 -m venv .venv
	$(PY) -m pip install -q -r requirements.txt
	npm install --silent

fetch:      ## ~1.1 GB from the pinned revision, checksummed
	$(PY) -m pipeline.fetch

run:        ## join, split, fit, score, measure -> results/, data/work/
	$(PY) -m pipeline.run

bundle:     ## results -> site/data/*.json, plus the independent count
	$(PY) -m pipeline.bundle
	$(PY) -m pipeline.verify_counts

test:
	$(PY) -m pytest -q tests
	npm test --silent

serve:
	npm run serve

e2e:        ## needs `make serve` in another terminal and Google Chrome installed
	node tests/e2e.mjs

captures:   ## needs `make serve`; rewrites docs/captures, docs/demo.gif, the social preview
	node scripts/captures.mjs
	$(PY) scripts/make_gif.py
