import os

# Os testes criam várias contas; em produção o cadastro fica fechado.
# Precisa ser antes de importar o app, que lê a configuração ao carregar.
os.environ.setdefault("REGISTRATION_OPEN", "true")
