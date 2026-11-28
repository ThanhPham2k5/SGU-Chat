package org.linkwave.chatservice.chat.group;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.Setter;
import org.linkwave.chatservice.chat.ChatMemberDto;

import java.util.List;

@Getter
@Setter
public class GroupChatDetailsDto {

    private String description;
    private List<ChatMemberDto> members;
    private int membersLimit;
    // Lombok sinh getter isPrivate(), Jackson sẽ đặt khoá là "private". Ghim khoá đúng để web/app đọc được.
    @JsonProperty("isPrivate")
    private boolean isPrivate;

}
