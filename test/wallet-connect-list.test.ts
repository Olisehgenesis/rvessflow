import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dedupeConnectors, splitWalletSections, type ListedConnector } from "@/lib/wallet-list";

describe("wallet connect list", () => {
  it("keeps Rabby Wallet with an icon and drops generic injected Rabby", () => {
    const listed = dedupeConnectors([
      { id: "injected", name: "Rabby", source: "injected" },
      { id: "rdns", name: "Rabby Wallet", rdns: "io.rabby", icon: "data:image/svg+xml,rabby", source: "announced" },
      { id: "injected-2", name: "Injected", source: "injected" },
    ]);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, "Rabby Wallet");
    assert.ok(listed[0].icon);
  });

  it("does not list Coinbase again when it is already installed", () => {
    const listed = dedupeConnectors([
      { id: "io.rabby", name: "Rabby Wallet", rdns: "io.rabby", icon: "rb", source: "announced" },
      { id: "com.coinbase.wallet", name: "Coinbase Wallet", rdns: "com.coinbase.wallet", icon: "cb", source: "announced" },
      { id: "walletconnect", name: "WalletConnect", source: "walletconnect" },
      { id: "coinbase", name: "Coinbase Wallet", rdns: "com.coinbase.wallet", source: "coinbase" },
    ]);
    assert.equal(listed.filter((item) => /coinbase/i.test(item.name)).length, 1);
    assert.equal(listed.find((item) => /coinbase/i.test(item.name))?.source, "announced");
  });

  it("keeps a single Base row when explorer and custom Base both appear", () => {
    const listed = dedupeConnectors([
      { id: "base-a", name: "Base", source: "coinbase" },
      { id: "base-b", name: "Base", source: "coinbase", icon: "https://example/base.png" },
      { id: "wc", name: "WalletConnect", source: "walletconnect", icon: "wc" },
    ]);
    const bases = listed.filter((item) => item.name === "Base");
    assert.equal(bases.length, 1);
    assert.ok(bases[0].icon);
    assert.equal(listed.filter((item) => item.source === "walletconnect").length, 1);
  });

  it("puts one recent wallet above installed and does not repeat it", () => {
    const connectors: ListedConnector[] = [
      { id: "io.metamask", name: "MetaMask", rdns: "io.metamask", icon: "mm", source: "announced" },
      { id: "io.rabby", name: "Rabby Wallet", rdns: "io.rabby", icon: "rb", source: "announced" },
      { id: "walletconnect", name: "WalletConnect", source: "walletconnect" },
    ];
    const { recent, installed, other } = splitWalletSections(connectors, "io.rabby");
    assert.equal(recent.length, 1);
    assert.equal(recent[0].name, "Rabby Wallet");
    assert.equal(installed.length, 1);
    assert.equal(installed[0].name, "MetaMask");
    assert.equal(other.length, 1);
  });
});
