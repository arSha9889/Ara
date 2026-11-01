import WebRTC

/// Граница интеграции с поставляемым WebRTC XCFramework. UI и сетевое ядро
/// не импортируют WebRTC напрямую; последующая логика звонков работает только
/// через этот объект в `Features/Calls`.
protocol CallPeerConnectionProviding: AnyObject {
    func makePeerConnection(
        iceServers: [RTCIceServer],
        delegate: RTCPeerConnectionDelegate
    ) -> RTCPeerConnection?
}

final class WebRTCPeerConnectionProvider: CallPeerConnectionProviding {
    private let factory: RTCPeerConnectionFactory

    init() {
        factory = RTCPeerConnectionFactory()
    }

    func makePeerConnection(
        iceServers: [RTCIceServer],
        delegate: RTCPeerConnectionDelegate
    ) -> RTCPeerConnection? {
        let configuration = RTCConfiguration()
        configuration.iceServers = iceServers
        configuration.iceTransportPolicy = .relay
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        return factory.peerConnection(with: configuration, constraints: constraints, delegate: delegate)
    }
}
