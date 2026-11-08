package org.linkwave.chatservice.api.ws;

import java.time.Instant;

public record BotMessageNotification(
        String id,
        String chatId,
        Long senderId,
        String senderName,
        String text,
        Instant timestamp
) {
}