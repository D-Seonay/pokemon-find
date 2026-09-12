# Ansible — déploiement pokemon-find sur Proxmox

Cinq playbooks pour créer la VM pokemon-find, la rendre joignable en SSH, y
déployer la stack docker-compose, et la brancher sur l'ingress du cluster k3s
(lifeos) qui tourne sur ce même hôte Proxmox.

Même schéma que le déploiement de [bardenoa](https://github.com/D-Seonay/openbar),
sur le même hôte — deux différences, détaillées plus bas : ce dépôt est
**public**, et l'application n'a **aucun secret**.

## Pourquoi ce réseau est inhabituel

L'hôte Proxmox n'a qu'une interface WiFi, et le WiFi ne se bridge pas comme de
l'Ethernet : la plupart des points d'accès rejettent les trames dont la MAC ne
correspond pas à l'interface WiFi elle-même. `vmbr0` est donc un réseau isolé
(`10.10.10.0/24`) sans carte physique dedans. Une VM qui y naît n'a par défaut
ni accès à Internet, ni visibilité depuis le LAN — d'où `setup-vm-nat.yml`.

Le trafic web, lui, ne demande aucune ouverture de port supplémentaire : le
cluster k3s expose déjà 80/443 via son ingress Traefik, qui route par nom
d'hôte. Exposer une application de plus se résume à ajouter une règle de
routage (`configure-ingress.yml`).

|                 |                                         |
| --------------- | --------------------------------------- |
| Hôte Proxmox    | `192.168.1.253` (WiFi, IP non garantie) |
| VM k3s (lifeos) | `10.10.10.50`                           |
| VM bardenoa     | `10.10.10.51`, SSH `2223`               |
| VM pokemon-find | `10.10.10.52`, SSH `2224`, vmid `9002`  |
| Domaine         | `pokemon-find.seonay.eu`                |

## Prérequis

- Accès SSH root à l'hôte Proxmox (`192.168.1.253` — cette IP peut changer,
  vérifie-la dans l'interface de la Freebox si un playbook part en timeout)
- Accès SSH à la VM k3s (`10.10.10.50`), joignable uniquement via `ProxyJump`
  par l'hôte Proxmox
- `ansible-playbook` en local (`brew install ansible`)
- Une clé SSH locale à injecter dans la VM (`~/.ssh/id_rsa.pub` par défaut)
- Les playbooks `[pokemon_find]`/`[k3s]` tournent avec `become: true`, ce qui
  suppose un sudo sans mot de passe pour l'utilisateur `debian` — vrai par
  défaut sur les images cloud Debian

```bash
cp ansible/inventory.ini.example ansible/inventory.ini
# ce fichier est gitignoré (détails réseau internes)
```

Aucun secret n'est nécessaire, contrairement à bardenoa : toutes les variables
d'environnement de pokemon-find ont une valeur par défaut utilisable (voir le
README racine) et `docker-compose.yml` déclare `.env` en `required: false`.

## Usage

```bash
# 1. Crée la VM (Debian 12 cloud image, 2 vCPU / 2 Go / 20 Go, 10.10.10.52)
ansible-playbook -i ansible/inventory.ini ansible/create-proxmox-vm.yml

# 2. Ouvre l'accès SSH depuis le LAN : ssh -p 2224 debian@192.168.1.253
ansible-playbook -i ansible/inventory.ini ansible/setup-vm-nat.yml

# 3. Installe Docker, clone le dépôt, lance `docker compose up -d --build`,
#    et attend que /healthz réponde.
#    Note : après create-proxmox-vm.yml, cloud-init met 30 à 60 secondes à
#    finir de configurer la VM (réseau, clé SSH). Si la connexion échoue
#    juste après le playbook précédent, patiente puis relance.
ansible-playbook -i ansible/inventory.ini ansible/deploy-pokemon-find.yml

# 4. Route pokemon-find.seonay.eu vers la VM depuis l'ingress k3s existant
ansible-playbook -i ansible/inventory.ini ansible/configure-ingress.yml

# 5. (Optionnel, une seule fois) Runner GitHub Actions auto-hébergé, pour que
#    chaque push sur main redéploie tout seul. LIRE la section Sécurité
#    ci-dessous avant : ce dépôt est public. Le token expire après ~1h.
gh api -X POST repos/D-Seonay/pokemon-find/actions/runners/registration-token --jq .token
ansible-playbook -i ansible/inventory.ini ansible/setup-github-runner.yml \
  -e github_runner_token=<token-collé-ci-dessus>
```

Les étapes 1, 2 et 5 ne se font qu'une fois. L'étape 3 est rejouable à volonté
pour redéployer ; l'étape 4 seulement si le domaine ou l'IP de la VM change.

## Ce que le dépôt public change

**Pas de deploy key.** bardenoa, dépôt privé, doit générer une clé sur la VM,
l'afficher, échouer, attendre son enregistrement sur GitHub, puis être relancé.
Ici le clone se fait en HTTPS anonyme : le premier run aboutit directement.

**Le runner auto-hébergé demande de l'attention.** bardenoa peut s'en
contenter sans arrière-pensée parce que son dépôt est privé. Un runner
auto-hébergé sur un dépôt public exécute potentiellement du code venu de
l'extérieur sur ta machine. Trois choses contiennent ce risque ici :

- `deploy.yml` se déclenche sur `push` vers `main` uniquement — une pull
  request depuis un fork ne peut pas le déclencher ;
- `ci.yml`, qui reçoit les pull requests, tourne sur `ubuntu-latest`, chez
  GitHub, pas sur la VM ;
- le runner porte l'étiquette `pokemon-find-vm`, que `deploy.yml` cible
  explicitement plutôt que le générique `self-hosted`.

Ce qui casserait ça : ajouter un déclencheur `pull_request` au workflow de
déploiement, ou basculer sur ce runner un workflow déclenché par pull request.
Vérifie aussi, côté GitHub, que **Settings → Actions → General → Fork pull
request workflows** exige une approbation.

Si ce compromis ne te convient pas, sauter l'étape 5 : `deploy-pokemon-find.yml`
relancé à la main fait exactement le même travail.

## Déploiement continu

Une fois l'étape 5 en place, chaque `git push` sur `main` déclenche
`.github/workflows/deploy.yml` sur la VM : `git pull`, `docker compose up -d
--build`, puis vérification de `/healthz`. Cette dernière étape compte — sans
elle, un déploiement cassé s'afficherait en vert, `docker compose up -d`
rendant la main au démarrage du conteneur et non quand l'application est prête.

`deploy-pokemon-find.yml` reste utile pour les changements d'infrastructure
(nouvelle variable d'environnement, modification de la configuration Docker).

## DNS

`pokemon-find.seonay.eu` doit pointer vers l'IP publique de la Freebox. Le port
forward 80/443 vers la VM k3s existe déjà, rien à ajouter. En attendant la
propagation DNS, tu peux tester en mappant le domaine vers cette IP publique
dans le `/etc/hosts` de ta machine cliente (pas sur les VM).

## HTTPS

`configure-ingress.yml` demande un certificat Let's Encrypt à cert-manager
(`ClusterIssuer` `letsencrypt-prod`, déjà installé sur ce cluster, solveur
`http01` sur `ingressClassName: traefik`). Le certificat est émis
automatiquement au premier `kubectl apply`. Vérifier :

```bash
ssh -J root@192.168.1.253 debian@10.10.10.50 \
  "sudo KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl get certificate pokemon-find-tls"
```

`READY: True` signifie que `https://pokemon-find.seonay.eu` sert un certificat
valide.

## WebSocket

Le multijoueur passe par Socket.IO, qui démarre en long-polling HTTP puis
bascule en WebSocket. Traefik relaie l'upgrade nativement, sans annotation
dédiée. La question des sessions collantes ne se pose pas : il n'y a qu'un seul
backend derrière le Service.

Si le solo fonctionne mais que les rooms restent bloquées sur « connexion… »,
c'est le premier endroit où regarder — vérifie d'abord directement sur la VM,
sans passer par l'ingress :

```bash
curl -fsS http://10.10.10.52:3000/healthz   # depuis l'hôte Proxmox
```

## Dépannage

**`Host key verification failed`** : Ansible ne peut pas répondre au prompt
interactif que SSH pose la première fois qu'il voit un hôte. C'est pour ça que
`ansible_ssh_common_args` inclut `-o StrictHostKeyChecking=accept-new` pour les
groupes `[k3s]` et `[pokemon_find]` — accepte une clé _jamais vue_, mais refuse
toujours une clé qui _change_. Si l'erreur persiste, cherche une entrée en
conflit dans `~/.ssh/known_hosts` (`ssh-keygen -R 10.10.10.52`).

**Timeout SSH vers l'hôte Proxmox** : l'hôte n'a que du WiFi, sans réservation
DHCP statique connue — son IP peut changer entre deux sessions. Vérifie-la dans
l'interface de la Freebox, puis mets-la à jour dans `ansible/inventory.ini`, à
la fois pour `[proxmox]` et dans les `ProxyJump` des deux autres groupes.

**VM à moitié provisionnée** : `create-proxmox-vm.yml` est idempotent seulement
sur l'existence du `vmid`. Si `qm importdisk` ou l'injection de la clé SSH
échoue après la création de la coquille (ex : `local-lvm` plein), le vmid 9002
existe et le playbook considérera la VM comme prête au run suivant, alors
qu'elle est incomplète. Pour repartir de zéro : `qm destroy 9002` sur l'hôte
Proxmox, puis relance.

**`wan_iface` incorrect** : `setup-vm-nat.yml` suppose l'interface WiFi nommée
`wlo1`. iptables accepte silencieusement une interface qui n'existe pas — le
playbook réussit, mais aucun trafic ne passe et `ssh -p 2224 …` reste bloqué
sans erreur. Vérifie le nom réel avec `ip -br link` sur l'hôte avant de lancer.

**Le playbook de déploiement échoue sur `/healthz`** : la stack a démarré mais
l'application ne répond pas. Les logs sur la VM :

```bash
ssh -p 2224 debian@192.168.1.253 "sudo docker compose -f /opt/pokemon-find/docker-compose.yml logs --tail 50"
```

**Build interrompu par manque de mémoire** : les 2 Go sont dimensionnés pour le
_build_ (pnpm install, tsc, Vite sur le monorepo), pas pour le service au repos
qui tient dans bien moins. Si `docker compose up --build` se fait tuer, c'est là
qu'il faut regarder — augmenter `memory_mb` dans `create-proxmox-vm.yml` puis
`qm set 9002 --memory 4096` sur l'hôte.

**L'ingress répond 502 ou part en timeout** : vérifie d'abord que la stack
tourne directement sur la VM (`curl http://10.10.10.52:3000/healthz` depuis
l'hôte Proxmox) avant de creuser côté k3s/Traefik.

**Runner à moitié installé** : `setup-github-runner.yml` est idempotent
seulement sur l'existence de `~/actions-runner/.runner`. Si `.runner` existe
mais que le service ne tourne pas (`sudo ~/actions-runner/svc.sh status`),
supprime le runner côté GitHub (Settings → Actions → Runners), `rm -rf
~/actions-runner` sur la VM, régénère un token et relance.

## Hors scope

- Sauvegardes : le jeu n'a pas de base de données. Tout l'état d'une partie vit
  en mémoire du processus serveur, et les scores des joueurs dans le
  `localStorage` de leur navigateur. Un redéploiement coupe les rooms en cours
  et ne perd rien d'autre.
- Supervision et alertes.
- Mise à l'échelle horizontale : les rooms étant en mémoire, un second
  conteneur ne partagerait pas leur état.
