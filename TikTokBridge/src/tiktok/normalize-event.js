// Chuẩn hóa sự kiện từ tiktok-live-connector.
// Bản 2.x xuất dữ liệu protobuf "v3": user.id / user.displayId, chat.content, like.count, gift.gift{...}.
// Các bản cũ (legacy) dùng user.userId / uniqueId, comment, likeCount, giftDetails. Đọc được cả hai.

function firstHttpUrl(sources) {
    return sources
        .flatMap(source => Array.isArray(source) ? source : [])
        .find(url => typeof url === 'string' && /^https?:\/\//i.test(url)) || '';
}

function normalizeUser(data = {}) {
    const user = data.user || data;
    const profilePicture = user.profilePicture || {};
    const avatar = firstHttpUrl([
        profilePicture.urls,
        profilePicture.urlList,
        profilePicture.url,
        user.avatarThumb?.urlList,
        user.avatarMedium?.urlList,
        user.avatarLarge?.urlList,
        user.profilePictureUrls
    ]) || user.profilePictureUrl || '';
    const uniqueId = user.uniqueId || user.displayId || '';
    const rawId = user.userId || user.id || data.userId;
    const fallbackId = uniqueId || user.nickname || `guest-${Date.now()}`;
    const userId = rawId && String(rawId) !== '0' ? String(rawId) : fallbackId;

    return {
        userId: String(userId),
        uniqueId: String(uniqueId || fallbackId),
        nickname: String(user.nickname || uniqueId || 'TikTok user'),
        avatar: String(avatar)
    };
}

function eventId(data = {}) {
    return String(data.event?.msgId || data.common?.msgId || data.msgId || '');
}

function normalizeChat(data = {}) {
    return {
        type: 'chat',
        eventId: eventId(data),
        ...normalizeUser(data),
        comment: String(data.comment ?? data.content ?? '')
    };
}

function normalizeMember(data = {}) {
    return {
        type: 'member',
        eventId: eventId(data),
        ...normalizeUser(data)
    };
}

function normalizeGift(data = {}) {
    const details = data.giftDetails || data.extendedGiftInfo || data.gift || {};
    const repeatCount = Math.max(1, Number(data.repeatCount) || 1);
    const unitDiamondCount = Math.max(0, Number(details.diamondCount ?? data.diamondCount) || 0);
    const giftPictureUrl = firstHttpUrl([
        details.image?.urlList,
        details.giftImage?.url,
        details.icon?.urlList
    ]) || String(data.giftPictureUrl || '');

    return {
        type: 'gift',
        eventId: eventId(data),
        ...normalizeUser(data),
        giftId: String(data.giftId || details.id || ''),
        giftName: String(details.giftName || details.name || data.giftName || 'Gift'),
        giftPictureUrl,
        giftType: Number(details.giftType ?? details.type ?? data.giftType) || 0,
        repeatCount,
        repeatEnd: Boolean(Number(data.repeatEnd) || data.repeatEnd === true),
        unitDiamondCount,
        diamondCount: unitDiamondCount * repeatCount
    };
}

function normalizeLike(data = {}) {
    return {
        type: 'like',
        eventId: eventId(data),
        ...normalizeUser(data),
        likeCount: Math.max(1, Number(data.likeCount ?? data.count) || 1),
        totalLikeCount: Math.max(0, Number(data.totalLikeCount ?? data.total) || 0)
    };
}

function normalizeSocial(type, data = {}) {
    return {
        type,
        eventId: eventId(data),
        ...normalizeUser(data)
    };
}

// Quà kiểu combo (type 1) bắn nhiều tin trong lúc đang combo: chỉ lấy tin cuối (repeatEnd)
function isPendingGiftStreak(event) {
    return event.giftType === 1 && !event.repeatEnd;
}

module.exports = {
    normalizeUser,
    normalizeChat,
    normalizeMember,
    normalizeGift,
    normalizeLike,
    normalizeSocial,
    isPendingGiftStreak
};
