import { localDateString } from '../services/dashboardService.js';

export function createFeaturesController({ services }) {
  const { readings, goals, fun, items } = services;
  const today = (query) => query.today ?? localDateString();
  const yearOf = (query) => query.year ?? Number(today(query).slice(0, 4));
  const created = (res, body) => res.status(201).json(body);

  return {
    readings: async (req, res) => res.json(await readings.forCalendar(yearOf(req.valid.query), today(req.valid.query))),
    goalsList: async (req, res) => res.json(await goals.list(yearOf(req.valid.query), today(req.valid.query))),
    async goalSet(req, res) {
      const { year, metric, target } = req.valid.body;
      await goals.set(year, metric, target);
      res.json(await goals.list(year, localDateString()));
    },
    async goalRemove(req, res) {
      await goals.remove(req.valid.params.id);
      res.status(204).end();
    },
    startReading: async (req, res) => res.json(await items.startReading(req.valid.params.id, req.valid.body.date ?? localDateString())),

    challenges: async (req, res) => res.json({ data: await fun.listChallenges() }),
    challengeCreate: async (req, res) => created(res, await fun.createChallenge(req.valid.body)),
    challengeRename: async (req, res) => res.json(await fun.renameChallenge(req.valid.params.id, req.valid.body.name)),
    async challengeRemove(req, res) {
      await fun.deleteChallenge(req.valid.params.id);
      res.status(204).end();
    },
    promptAdd: async (req, res) => created(res, await fun.addPrompt(req.valid.params.id, req.valid.body.label)),
    slotUpdate: async (req, res) => res.json(await fun.updateSlot(req.valid.params.id, req.valid.body)),
    slotRemove: async (req, res) => res.json(await fun.removePrompt(req.valid.params.id)),

    favorites: async (req, res) => res.json(await fun.listFavorites(yearOf({ year: req.valid.params.year }))),
    favoritesSet: async (req, res) => res.json(await fun.setFavorites(req.valid.params.year, req.valid.params.month, req.valid.body.item_ids)),

    bracketCandidates: async (req, res) => res.json({ data: await fun.bracketCandidates(req.valid.params.year) }),
    brackets: async (req, res) => res.json({ data: await fun.listBrackets(req.valid.query.year) }),
    bracketCreate: async (req, res) => created(res, await fun.createBracket(req.valid.body)),
    bracketPick: async (req, res) => res.json(await fun.pick(req.valid.params.id, req.valid.body)),
    async bracketRemove(req, res) {
      await fun.deleteBracket(req.valid.params.id);
      res.status(204).end();
    },
  };
}
