package org.linkwave.chatservice.api;

import tools.jackson.databind.ObjectMapper;
import feign.Response;
import feign.codec.ErrorDecoder;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class ExceptionErrorDecoder implements ErrorDecoder {

    private final ObjectMapper objectMapper;

    @SneakyThrows
    @Override
    public RuntimeException decode(String method, @NonNull Response response) {
        // Ghi lại mã lỗi và nội dung trả về từ service khác để biết nguyên nhân
        String raw = "";
        try {
            if (response.body() != null) {
                raw = new String(response.body().asInputStream().readAllBytes(), StandardCharsets.UTF_8);
            }
        } catch (Exception ignored) {
            // không đọc được body thì để trống
        }
        log.error("Feign call failed: method={} status={} body={}", method, response.status(), raw);

        try {
            final Map<?, ?> errorAttributes = objectMapper.readValue(raw, Map.class);
            final HttpStatus httpStatus = HttpStatus.valueOf(response.status());
            if (httpStatus.is4xxClientError()) {
                return new ApiResponseClientErrorException(errorAttributes.get("message").toString());
            }
            return new ServiceErrorException();
        } catch (Exception e) {
            return new ServiceErrorException("Internal server error");
        }
    }

}