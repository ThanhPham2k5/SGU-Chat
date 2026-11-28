package org.linkwave.auth.security.utils;

import jakarta.servlet.http.HttpServletRequest;
import lombok.experimental.UtilityClass;

/** Nhận diện app di động qua header X-Client: mobile và đọc refresh token từ header X-Refresh-Token. */
@UtilityClass
public class MobileClient {
    public static final String CLIENT_HEADER = "X-Client";
    public static final String MOBILE = "mobile";
    public static final String REFRESH_TOKEN_HEADER = "X-Refresh-Token";

    public static boolean isMobile(HttpServletRequest request) {
        return MOBILE.equalsIgnoreCase(request.getHeader(CLIENT_HEADER));
    }
}
