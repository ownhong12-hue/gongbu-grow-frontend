const TIER_RANKS = {
    CHALLENGER: { name: 'Challenger', emoji: '👑', threshold: 0.01 },
    MASTER: { name: 'Master', emoji: '⚔️', threshold: 0.03 },
    DIAMOND: { name: 'Diamond', emoji: '💠', threshold: 0.08 },
    EMERALD: { name: 'Emerald', emoji: '💚', threshold: 0.15 },
    PLATINUM: { name: 'Platinum', emoji: '💎', threshold: 0.25 },
    GOLD: { name: 'Gold', emoji: '🥇', threshold: 0.40 },
    SILVER: { name: 'Silver', emoji: '🥈', threshold: 0.60 },
    BRONZE: { name: 'Bronze', emoji: '🥉', threshold: 1.00 }
};

function calculateTierFromRank(rank, totalUsers) {
    if (totalUsers === 0) {
        return { ...TIER_RANKS.BRONZE, percentile: 100 };
    }
    
    const percentile = rank / totalUsers;
    
    if (percentile <= TIER_RANKS.CHALLENGER.threshold) {
        return { ...TIER_RANKS.CHALLENGER, percentile: percentile * 100 };
    } else if (percentile <= TIER_RANKS.MASTER.threshold) {
        return { ...TIER_RANKS.MASTER, percentile: percentile * 100 };
    } else if (percentile <= TIER_RANKS.DIAMOND.threshold) {
        return { ...TIER_RANKS.DIAMOND, percentile: percentile * 100 };
    } else if (percentile <= TIER_RANKS.EMERALD.threshold) {
        return { ...TIER_RANKS.EMERALD, percentile: percentile * 100 };
    } else if (percentile <= TIER_RANKS.PLATINUM.threshold) {
        return { ...TIER_RANKS.PLATINUM, percentile: percentile * 100 };
    } else if (percentile <= TIER_RANKS.GOLD.threshold) {
        return { ...TIER_RANKS.GOLD, percentile: percentile * 100 };
    } else if (percentile <= TIER_RANKS.SILVER.threshold) {
        return { ...TIER_RANKS.SILVER, percentile: percentile * 100 };
    } else {
        return { ...TIER_RANKS.BRONZE, percentile: percentile * 100 };
    }
}

function getTierInfo(tierName) {
    const tier = Object.values(TIER_RANKS).find(t => t.name === tierName);
    return tier || TIER_RANKS.BRONZE;
}

module.exports = {
    TIER_RANKS,
    calculateTierFromRank,
    getTierInfo
};
