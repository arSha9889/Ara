import SwiftUI

struct AuthenticationRootView: View {
    @State private var route: AuthenticationRoute = .welcome

    var body: some View {
        Group {
            switch route {
            case .welcome:
                WelcomeView(route: $route)
            case .signIn:
                LoginView(route: $route)
            case .register:
                RegistrationView(route: $route)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(nsColor: .windowBackgroundColor))
    }
}

private struct WelcomeView: View {
    @Binding var route: AuthenticationRoute
    @EnvironmentObject private var preferences: PreferencesStore

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 50, weight: .semibold))
                .foregroundStyle(.tint)
                .accessibilityHidden(true)
            Text("welcome.title")
                .font(.largeTitle.weight(.bold))
            Text("welcome.subtitle")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 420)
            HStack {
                Button("welcome.signIn") {
                    route = .signIn
                }
                .keyboardShortcut(.defaultAction)

                Button("welcome.register") {
                    route = .register
                }
            }
            .controlSize(.large)

            Picker("settings.language", selection: $preferences.language) {
                Text("language.russian").tag(AppLanguage.russian)
                Text("language.english").tag(AppLanguage.english)
                Text("language.kazakh").tag(AppLanguage.kazakh)
            }
            .pickerStyle(.menu)
            .frame(width: 180)
        }
        .padding(48)
    }
}

private struct LoginView: View {
    enum Field: Hashable {
        case identifier
        case password
    }

    @Binding var route: AuthenticationRoute
    @EnvironmentObject private var sessionStore: SessionStore
    @FocusState private var focusedField: Field?
    @State private var identifier = ""
    @State private var password = ""
    @State private var errorMessage: String?
    @State private var isSubmitting = false

    var body: some View {
        AuthenticationCard(title: "auth.signIn") {
            TextField("auth.email", text: $identifier)
                .textContentType(.username)
                .focused($focusedField, equals: .identifier)

            SecureField("auth.password", text: $password)
                .textContentType(.password)
                .focused($focusedField, equals: .password)

            if let errorMessage {
                FormErrorView(message: errorMessage)
            }

            Button("auth.signIn") {
                submit()
            }
            .keyboardShortcut(.defaultAction)
            .disabled(isSubmitting || identifier.isEmpty || password.isEmpty)

            Button("auth.register") {
                route = .register
            }
            .buttonStyle(.link)
            .disabled(isSubmitting)
        }
        .onAppear {
            focusedField = .identifier
        }
        .onSubmit(submit)
    }

    private func submit() {
        guard !isSubmitting else { return }
        errorMessage = nil
        isSubmitting = true

        Task {
            defer { isSubmitting = false }
            do {
                try await sessionStore.login(identifier: identifier, password: password)
            } catch {
                errorMessage = error.localizedDescription
                focusedField = identifier.isEmpty ? .identifier : .password
            }
        }
    }
}

private struct RegistrationView: View {
    enum Stage {
        case email
        case code
        case details
    }

    enum Field: Hashable {
        case email
        case code
        case displayName
        case username
        case password
        case passwordConfirmation
    }

    @Binding var route: AuthenticationRoute
    @EnvironmentObject private var preferences: PreferencesStore
    @EnvironmentObject private var sessionStore: SessionStore
    @FocusState private var focusedField: Field?
    @State private var stage: Stage = .email
    @State private var email = ""
    @State private var code = ""
    @State private var displayName = ""
    @State private var username = ""
    @State private var password = ""
    @State private var passwordConfirmation = ""
    @State private var country = "RU"
    @State private var acceptedTerms = false
    @State private var acceptedPrivacyPolicy = false
    @State private var verificationID: UUID?
    @State private var errorMessage: String?
    @State private var isSubmitting = false

    var body: some View {
        AuthenticationCard(title: titleKey) {
            switch stage {
            case .email:
                TextField("auth.email", text: $email)
                    .focused($focusedField, equals: .email)
                submitButton(action: startVerification)
            case .code:
                TextField("auth.code", text: $code)
                    .textContentType(.oneTimeCode)
                    .focused($focusedField, equals: .code)
                submitButton(action: confirmVerification)
                backButton()
            case .details:
                TextField("auth.displayName", text: $displayName)
                    .focused($focusedField, equals: .displayName)
                TextField("auth.username", text: $username)
                    .focused($focusedField, equals: .username)
                SecureField("auth.password", text: $password)
                    .focused($focusedField, equals: .password)
                SecureField("auth.passwordConfirmation", text: $passwordConfirmation)
                    .focused($focusedField, equals: .passwordConfirmation)
                Picker("auth.country", selection: $country) {
                    Text("country.russia").tag("RU")
                    Text("country.kazakhstan").tag("KZ")
                    Text("country.kyrgyzstan").tag("KG")
                    Text("country.ukraine").tag("UA")
                    Text("country.belarus").tag("BY")
                    Text("country.uzbekistan").tag("UZ")
                }
                Toggle("auth.acceptTerms", isOn: $acceptedTerms)
                Toggle("auth.acceptPrivacy", isOn: $acceptedPrivacyPolicy)
                submitButton(action: completeRegistration)
                backButton()
            }

            if let errorMessage {
                FormErrorView(message: errorMessage)
            }
        }
        .onAppear {
            focusedField = .email
        }
        .onSubmit {
            switch stage {
            case .email:
                startVerification()
            case .code:
                confirmVerification()
            case .details:
                completeRegistration()
            }
        }
    }

    private var titleKey: LocalizedStringKey {
        switch stage {
        case .email:
            "auth.registration.email"
        case .code:
            "auth.registration.code"
        case .details:
            "auth.registration.details"
        }
    }

    @ViewBuilder
    private func submitButton(action: @escaping () -> Void) -> some View {
        Button("auth.continue") {
            action()
        }
        .keyboardShortcut(.defaultAction)
        .disabled(isSubmitting)
    }

    @ViewBuilder
    private func backButton() -> some View {
        Button("auth.back") {
            errorMessage = nil
            switch stage {
            case .email:
                route = .welcome
            case .code:
                stage = .email
                focusedField = .email
            case .details:
                stage = .code
                focusedField = .code
            }
        }
        .disabled(isSubmitting)
    }

    private func startVerification() {
        guard !isSubmitting, !email.isEmpty else {
            focusedField = .email
            return
        }
        errorMessage = nil
        isSubmitting = true

        Task {
            defer { isSubmitting = false }
            do {
                let response = try await sessionStore.startEmailVerification(email: email, language: preferences.language)
                verificationID = response.verificationID
                stage = .code
                focusedField = .code
            } catch {
                errorMessage = error.localizedDescription
                focusedField = .email
            }
        }
    }

    private func confirmVerification() {
        guard !isSubmitting, let verificationID, !code.isEmpty else {
            focusedField = .code
            return
        }
        errorMessage = nil
        isSubmitting = true

        Task {
            defer { isSubmitting = false }
            do {
                try await sessionStore.confirmEmailVerification(id: verificationID, code: code)
                stage = .details
                focusedField = .displayName
            } catch {
                errorMessage = error.localizedDescription
                focusedField = .code
            }
        }
    }

    private func completeRegistration() {
        guard !isSubmitting, let verificationID else { return }
        guard !displayName.isEmpty, !username.isEmpty, !password.isEmpty else {
            errorMessage = String(localized: "auth.requiredFields")
            focusedField = displayName.isEmpty ? .displayName : username.isEmpty ? .username : .password
            return
        }
        guard password == passwordConfirmation else {
            errorMessage = String(localized: "auth.passwordMismatch")
            focusedField = .passwordConfirmation
            return
        }
        guard acceptedTerms, acceptedPrivacyPolicy else {
            errorMessage = String(localized: "auth.acceptRequired")
            return
        }

        errorMessage = nil
        isSubmitting = true
        Task {
            defer { isSubmitting = false }
            do {
                try await sessionStore.completeRegistration(
                    verificationID: verificationID,
                    username: username,
                    password: password,
                    displayName: displayName,
                    country: country,
                    language: preferences.language,
                    acceptedTerms: acceptedTerms,
                    acceptedPrivacyPolicy: acceptedPrivacyPolicy
                )
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

private struct AuthenticationCard<Content: View>: View {
    let title: LocalizedStringKey
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title)
                .font(.title.bold())
            content
        }
        .textFieldStyle(.roundedBorder)
        .frame(width: 360)
        .padding(32)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .padding(32)
    }
}

private struct FormErrorView: View {
    let message: String

    var body: some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .foregroundStyle(.red)
            .accessibilityLabel(Text(message))
    }
}
