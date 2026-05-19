import React, { useEffect, useMemo, useState } from "react";
import { LANGUAGES } from "./language";

const STORAGE_KEY = "king-scorekeeper-state";
const defaultNames = ["", "", "", ""];

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

function loadSavedGame() {
  try {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function createEmptyCounts(players, contract) {
  const counts = {};
  players.forEach((player) => {
    counts[player.id] = contract.mode === "single" ? false : 0;
  });
  return counts;
}

function createUsedContracts(players) {
  const used = {};
  players.forEach((player) => {
    used[player.id] = [];
  });
  return used;
}

export default function App() {
  const [savedGame] = useState(() => loadSavedGame());

  const [lang, setLang] = useState(savedGame?.lang || "en");
  const [playerCount, setPlayerCount] = useState(savedGame?.playerCount || 3);
  const [names, setNames] = useState(savedGame?.names || defaultNames);
  const [chooserIndex, setChooserIndex] = useState(
    savedGame?.chooserIndex || 0,
  );
  const [selectedContractId, setSelectedContractId] = useState(
    savedGame?.selectedContractId || "no-tricks",
  );
  const [history, setHistory] = useState(savedGame?.history || []);
  const [usedContracts, setUsedContracts] = useState(
    savedGame?.usedContracts || { p1: [], p2: [], p3: [] },
  );
  const [counts, setCounts] = useState(
    savedGame?.counts || { p1: 0, p2: 0, p3: 0 },
  );
  const [error, setError] = useState("");

  const language = LANGUAGES[lang] || LANGUAGES.en;
  const ui = language.ui;
  const contracts = language.contracts[playerCount];
  const rules = language.rules[playerCount];

  const players = useMemo(() => {
    return Array.from({ length: playerCount }, (_, index) => ({
      id: `p${index + 1}`,
      name: names[index]?.trim() || `${ui.player} ${index + 1}`,
    }));
  }, [playerCount, names, ui.player]);

  const chooser = players[chooserIndex] || players[0];

  const availableContracts = useMemo(() => {
    const usedByChooser = usedContracts[chooser?.id] || [];
    return contracts.filter((contract) => !usedByChooser.includes(contract.id));
  }, [contracts, usedContracts, chooser]);

  const currentContract = useMemo(() => {
    return (
      contracts.find((contract) => contract.id === selectedContractId) ||
      availableContracts[0] ||
      contracts[0]
    );
  }, [contracts, selectedContractId, availableContracts]);

  const totalRounds = contracts.length * playerCount;
  const gameFinished = history.length >= totalRounds;

  useEffect(() => {
    const gameState = {
      lang,
      playerCount,
      names,
      chooserIndex,
      selectedContractId,
      history,
      usedContracts,
      counts,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
  }, [
    lang,
    playerCount,
    names,
    chooserIndex,
    selectedContractId,
    history,
    usedContracts,
    counts,
  ]);

  const totals = useMemo(() => {
    const result = {};
    players.forEach((player) => {
      result[player.id] = 0;
    });

    history.forEach((round) => {
      players.forEach((player) => {
        result[player.id] += round.scores[player.id] || 0;
      });
    });

    return result;
  }, [history, players]);

  const rankedPlayers = useMemo(() => {
    return [...players].sort((a, b) => totals[b.id] - totals[a.id]);
  }, [players, totals]);

  const previewScores = useMemo(() => {
    const result = {};

    players.forEach((player) => {
      if (currentContract.mode === "single") {
        result[player.id] = counts[player.id] ? currentContract.points : 0;
      } else {
        result[player.id] =
          Number(counts[player.id] || 0) * currentContract.pointsPerUnit;
      }
    });

    return result;
  }, [players, counts, currentContract]);

  const countSum = useMemo(() => {
    if (currentContract.mode === "single") {
      return players.filter((player) => counts[player.id]).length;
    }

    return players.reduce((sum, player) => {
      return sum + Number(counts[player.id] || 0);
    }, 0);
  }, [counts, players, currentContract]);

  const chooserProgress = useMemo(() => {
    const result = {};
    players.forEach((player) => {
      result[player.id] = usedContracts[player.id]?.length || 0;
    });
    return result;
  }, [players, usedContracts]);

  function resetInputs(contract = currentContract, nextPlayers = players) {
    setCounts(createEmptyCounts(nextPlayers, contract));
    setError("");
  }

  function changePlayerCount(nextCount) {
    const nextPlayers = Array.from({ length: nextCount }, (_, index) => ({
      id: `p${index + 1}`,
    }));
    const nextUsed = createUsedContracts(nextPlayers);
    const nextContract = language.contracts[nextCount][0];

    setPlayerCount(nextCount);
    setChooserIndex(0);
    setSelectedContractId(nextContract.id);
    setHistory([]);
    setUsedContracts(nextUsed);
    setCounts(createEmptyCounts(nextPlayers, nextContract));
    setError("");
  }

  function updateName(index, value) {
    setNames((previous) => {
      const next = [...previous];
      next[index] = value;
      return next;
    });
  }

  function selectContract(contract) {
    setSelectedContractId(contract.id);
    resetInputs(contract);
  }

  function updateCount(playerId, value) {
    setError("");

    if (currentContract.mode === "single") {
      setCounts(() => {
        const next = {};

        players.forEach((player) => {
          next[player.id] = player.id === playerId;
        });

        return next;
      });

      return;
    }

    const onlyNumbers = value.replace(/\D/g, "");

    const cleanValue = Math.max(
      currentContract.min,
      Math.min(currentContract.max, Number(onlyNumbers || 0)),
    );

    setCounts((previous) => ({
      ...previous,
      [playerId]: cleanValue,
    }));
  }

  function validateRound() {
    if (!chooser) return ui.errors.choosePlayer;

    if ((usedContracts[chooser.id] || []).includes(currentContract.id)) {
      return ui.errors.alreadyUsed(chooser.name, currentContract.name);
    }

    if (currentContract.mode === "single") {
      if (countSum !== 1) return ui.errors.chooseOneKing;
      return "";
    }

    if (countSum !== currentContract.max) {
      return ui.errors.totalMustBe(currentContract.max, countSum);
    }

    return "";
  }

  function findNextChooserIndex(nextUsedContracts, currentIndex) {
    for (let step = 1; step <= players.length; step += 1) {
      const nextIndex = (currentIndex + step) % players.length;
      const nextPlayer = players[nextIndex];
      const usedCount = nextUsedContracts[nextPlayer.id]?.length || 0;

      if (usedCount < contracts.length) return nextIndex;
    }

    return currentIndex;
  }

  function saveRound() {
    const validationError = validateRound();

    if (validationError) {
      setError(validationError);
      return;
    }

    const roundRecord = {
      roundNumber: history.length + 1,
      chooserId: chooser.id,
      chooserName: chooser.name,
      contractId: currentContract.id,
      contractName: currentContract.name,
      entries: { ...counts },
      scores: { ...previewScores },
    };

    const nextHistory = [...history, roundRecord];
    const nextUsedContracts = {
      ...usedContracts,
      [chooser.id]: [...(usedContracts[chooser.id] || []), currentContract.id],
    };

    setHistory(nextHistory);
    setUsedContracts(nextUsedContracts);

    const nextChooserIndex = findNextChooserIndex(
      nextUsedContracts,
      chooserIndex,
    );

    const nextChooser = players[nextChooserIndex];
    const nextAvailableContracts = contracts.filter((contract) => {
      return !(nextUsedContracts[nextChooser.id] || []).includes(contract.id);
    });
    const nextContract = nextAvailableContracts[0] || contracts[0];

    setChooserIndex(nextChooserIndex);
    setSelectedContractId(nextContract.id);
    resetInputs(nextContract);
  }

  function undoLastRound() {
    if (history.length === 0) return;

    const nextHistory = history.slice(0, -1);
    const nextUsedContracts = createUsedContracts(players);

    nextHistory.forEach((round) => {
      nextUsedContracts[round.chooserId] = [
        ...(nextUsedContracts[round.chooserId] || []),
        round.contractId,
      ];
    });

    const lastRound = history[history.length - 1];
    const restoredChooserIndex = players.findIndex((player) => {
      return player.id === lastRound.chooserId;
    });
    const restoredContract =
      contracts.find((contract) => contract.id === lastRound.contractId) ||
      contracts[0];

    setHistory(nextHistory);
    setUsedContracts(nextUsedContracts);
    setChooserIndex(restoredChooserIndex >= 0 ? restoredChooserIndex : 0);
    setSelectedContractId(restoredContract.id);
    setCounts({ ...lastRound.entries });
    setError("");
  }

  function resetGame() {
    localStorage.removeItem(STORAGE_KEY);

    const nextUsed = createUsedContracts(players);
    const firstContract = contracts[0];

    setChooserIndex(0);
    setSelectedContractId(firstContract.id);
    setHistory([]);
    setUsedContracts(nextUsed);
    setCounts(createEmptyCounts(players, firstContract));
    setError("");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:px-8">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 shadow-2xl sm:rounded-[2rem]">
          <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200 sm:text-sm">
                {ui.badge}
              </div>

              <h1 className="text-2xl font-black tracking-tight sm:text-5xl">
                {ui.title}
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
                {ui.subtitle}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 sm:text-sm">
                  {ui.gameSetup}
                </p>

                <select
                  value={lang}
                  onChange={(event) => setLang(event.target.value)}
                  className="h-10 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-bold outline-none focus:border-amber-300"
                >
                  <option value="en">English</option>
                  <option value="ka">ქართული</option>
                </select>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
                {[3, 4].map((count) => (
                  <button
                    key={count}
                    onClick={() => changePlayerCount(count)}
                    className={classNames(
                      "rounded-2xl border px-3 py-3 text-left transition sm:px-4 sm:py-4",
                      playerCount === count
                        ? "border-amber-300 bg-amber-300 text-slate-950 shadow-lg shadow-amber-500/20"
                        : "border-white/10 bg-slate-900 hover:bg-slate-800",
                    )}
                  >
                    <span className="block text-xl font-black sm:text-2xl">
                      {count}
                    </span>
                    <span className="text-xs font-semibold sm:text-sm">
                      {ui.playersButton}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-3 space-y-2 rounded-2xl bg-slate-950/60 p-3 text-xs text-slate-300 sm:p-4 sm:text-sm">
                <p>
                  <span className="font-bold text-slate-100">{ui.deck}:</span>{" "}
                  {rules.cards}
                </p>
                <p>
                  <span className="font-bold text-slate-100">{ui.deal}:</span>{" "}
                  {rules.deal}
                </p>
                <p>
                  <span className="font-bold text-slate-100">{ui.remove}:</span>{" "}
                  {rules.remove}
                </p>
                <p>
                  <span className="font-bold text-slate-100">{ui.tricks}:</span>{" "}
                  {rules.tricks}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:gap-6">
          <div className="space-y-4 sm:space-y-6">
            <div className="rounded-3xl border border-white/10 bg-slate-900 p-4 shadow-xl sm:rounded-[2rem] sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-black sm:text-xl">{ui.players}</h2>

                <button
                  onClick={resetGame}
                  className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/10 sm:text-sm"
                >
                  {ui.reset}
                </button>
              </div>

              <div className="space-y-3">
                {players.map((player, index) => (
                  <label key={player.id} className="block">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:text-xs">
                      {ui.player} {index + 1}
                    </span>

                    <input
                      value={names[index]}
                      placeholder={`${ui.player} ${index + 1}`}
                      onChange={(event) =>
                        updateName(index, event.target.value)
                      }
                      className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-semibold outline-none transition placeholder:text-slate-600 focus:border-amber-300 sm:h-12 sm:text-base"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900 p-4 shadow-xl sm:rounded-[2rem] sm:p-5">
              <h2 className="mb-4 text-lg font-black sm:text-xl">
                {ui.chooserProgress}
              </h2>

              <div className="space-y-3">
                {players.map((player) => (
                  <div
                    key={player.id}
                    className="rounded-2xl border border-white/10 bg-slate-950 p-3 sm:p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <p className="font-black">{player.name}</p>
                      <p className="font-bold text-slate-400">
                        {chooserProgress[player.id]} / {contracts.length}
                      </p>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-amber-300"
                        style={{
                          width: `${
                            (chooserProgress[player.id] / contracts.length) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900 p-4 shadow-xl sm:rounded-[2rem] sm:p-5">
              <h2 className="mb-4 text-lg font-black sm:text-xl">
                {ui.scoreboard}
              </h2>

              <div className="space-y-3">
                {rankedPlayers.map((player, index) => (
                  <div
                    key={player.id}
                    className={classNames(
                      "flex items-center justify-between rounded-2xl border p-3 sm:p-4",
                      index === 0
                        ? "border-amber-300/50 bg-amber-300/10"
                        : "border-white/10 bg-slate-950",
                    )}
                  >
                    <div>
                      <p className="text-sm font-black sm:text-base">
                        {index + 1}. {player.name}
                      </p>
                      <p className="text-xs text-slate-400 sm:text-sm">
                        {ui.totalScore}
                      </p>
                    </div>

                    <p
                      className={classNames(
                        "text-xl font-black sm:text-2xl",
                        totals[player.id] >= 0
                          ? "text-emerald-300"
                          : "text-rose-300",
                      )}
                    >
                      {totals[player.id]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 sm:space-y-6">
            <div className="rounded-3xl border border-white/10 bg-slate-900 p-4 shadow-xl sm:rounded-[2rem] sm:p-5">
              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 sm:text-sm">
                    {ui.round} {Math.min(history.length + 1, totalRounds)} /{" "}
                    {totalRounds}
                  </p>

                  <h2 className="mt-1 text-xl font-black sm:text-2xl">
                    {gameFinished
                      ? ui.gameFinished
                      : ui.chooserChoice(chooser?.name)}
                  </h2>

                  <p className="mt-2 text-sm text-slate-300 sm:text-base">
                    {gameFinished ? ui.allModesUsed : ui.chooseUnusedMode}
                  </p>
                </div>

                <div className="rounded-2xl bg-amber-300/15 px-4 py-3 text-sm font-black text-amber-200">
                  {contracts.length} {ui.modes} × {playerCount}{" "}
                  {ui.playersButton}
                </div>
              </div>

              {!gameFinished && (
                <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {contracts.map((contract) => {
                    const isUsed = (usedContracts[chooser?.id] || []).includes(
                      contract.id,
                    );
                    const isSelected = currentContract.id === contract.id;

                    return (
                      <button
                        key={contract.id}
                        onClick={() => !isUsed && selectContract(contract)}
                        disabled={isUsed}
                        className={classNames(
                          "rounded-2xl border p-3 text-left transition",
                          isSelected &&
                            !isUsed &&
                            "border-amber-300 bg-amber-300/10",
                          isUsed &&
                            "cursor-not-allowed border-white/5 bg-slate-950/60 opacity-45",
                          !isSelected &&
                            !isUsed &&
                            "border-white/10 bg-slate-950 hover:bg-slate-800",
                        )}
                      >
                        <p className="text-sm font-black">{contract.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {isUsed ? ui.alreadyUsed : contract.scoringText}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}

              {!gameFinished && (
                <>
                  <div className="mb-5 rounded-2xl border border-white/10 bg-slate-950 p-4">
                    <h3 className="text-lg font-black">
                      {currentContract.name}
                    </h3>

                    <p className="mt-1 text-sm text-slate-300">
                      {currentContract.description}
                    </p>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-slate-900 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:text-xs">
                          {ui.scoring}
                        </p>
                        <p className="mt-1 text-sm font-bold sm:text-base">
                          {currentContract.scoringText}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-900 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:text-xs">
                          {ui.roundTotal}
                        </p>
                        <p className="mt-1 text-sm font-bold sm:text-base">
                          {currentContract.maxText}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {players.map((player) => (
                      <div
                        key={player.id}
                        className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950 p-3 sm:grid-cols-[1fr_160px_80px] sm:items-center sm:p-4"
                      >
                        <div>
                          <p className="text-sm font-black sm:text-base">
                            {player.name}
                          </p>
                          <p className="text-xs text-slate-500 sm:text-sm">
                            {currentContract.label}
                          </p>
                        </div>

                        {currentContract.mode === "single" ? (
                          <button
                            onClick={() => updateCount(player.id, true)}
                            className={classNames(
                              "h-11 rounded-2xl border px-4 text-sm font-black transition sm:h-12",
                              counts[player.id]
                                ? "border-amber-300 bg-amber-300 text-slate-950"
                                : "border-white/10 bg-slate-900 hover:bg-slate-800",
                            )}
                          >
                            {counts[player.id] ? ui.selected : ui.choose}
                          </button>
                        ) : (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={counts[player.id]}
                            onChange={(event) =>
                              updateCount(player.id, event.target.value)
                            }
                            className="h-11 rounded-2xl border border-white/10 bg-slate-900 px-4 text-center text-base font-black outline-none transition focus:border-amber-300 sm:h-12 sm:text-lg"
                          />
                        )}

                        <div className="rounded-2xl bg-slate-900 px-4 py-3 text-center">
                          <p
                            className={classNames(
                              "text-lg font-black",
                              previewScores[player.id] >= 0
                                ? "text-emerald-300"
                                : "text-rose-300",
                            )}
                          >
                            {previewScores[player.id]}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {currentContract.mode !== "single" && (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                      {ui.currentTotal}:{" "}
                      <span className="font-black text-slate-100">
                        {countSum}
                      </span>{" "}
                      / {ui.required}{" "}
                      <span className="font-black text-slate-100">
                        {currentContract.max}
                      </span>
                    </div>
                  )}

                  {error && (
                    <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm font-semibold text-rose-200 sm:text-base">
                      {error}
                    </div>
                  )}

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <button
                      onClick={saveRound}
                      className="w-full min-h-[50px] flex-1 rounded-2xl bg-amber-300 px-5 py-5 text-lg font-black text-slate-950 transition hover:bg-amber-200 active:scale-[0.99] sm:min-h-0  sm:py-0 sm:text-base"
                    >
                      {ui.saveRound}
                    </button>

                    <button
                      onClick={undoLastRound}
                      className="h-12 rounded-2xl border border-white/10 px-5 font-black text-slate-300 transition hover:bg-white/10"
                    >
                      {ui.undoLast}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900 p-4 shadow-xl sm:rounded-[2rem] sm:p-5">
              <h2 className="mb-4 text-lg font-black sm:text-xl">
                {ui.roundHistory}
              </h2>

              {history.length === 0 ? (
                <p className="rounded-2xl bg-slate-950 p-4 text-sm text-slate-400 sm:text-base">
                  {ui.noRounds}
                </p>
              ) : (
                <div className="overflow-x-auto pb-1">
                  <table className="w-full min-w-[700px] border-separate border-spacing-y-2 text-left text-sm">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="px-3 py-2">{ui.round}</th>
                        <th className="px-3 py-2">{ui.chooser}</th>
                        <th className="px-3 py-2">{ui.mode}</th>

                        {players.map((player) => (
                          <th key={player.id} className="px-3 py-2 text-right">
                            {player.name}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {history.map((round) => {
                        const translatedContract = contracts.find(
                          (contract) => contract.id === round.contractId,
                        );

                        return (
                          <tr key={round.roundNumber} className="bg-slate-950">
                            <td className="rounded-l-2xl px-3 py-3 font-bold">
                              {round.roundNumber}
                            </td>

                            <td className="px-3 py-3 font-bold">
                              {round.chooserName}
                            </td>

                            <td className="px-3 py-3 font-bold">
                              {translatedContract?.name || round.contractName}
                            </td>

                            {players.map((player, playerIndex) => (
                              <td
                                key={player.id}
                                className={classNames(
                                  "px-3 py-3 text-right font-black",
                                  playerIndex === players.length - 1 &&
                                    "rounded-r-2xl",
                                  round.scores[player.id] >= 0
                                    ? "text-emerald-300"
                                    : "text-rose-300",
                                )}
                              >
                                {round.scores[player.id] || 0}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900 p-4 shadow-xl sm:rounded-[2rem] sm:p-5">
              <h2 className="mb-4 text-lg font-black sm:text-xl">
                {ui.rulesReminder}
              </h2>

              <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                {ui.ruleCards.map((rule) => (
                  <div
                    key={rule.title}
                    className="rounded-2xl bg-slate-950 p-4"
                  >
                    <p className="font-black text-slate-100">{rule.title}</p>
                    <p className="mt-1">{rule.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
