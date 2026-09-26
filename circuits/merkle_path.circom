pragma circom 2.1.0;
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

template MerklePath(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];   // 0 = current node on left, 1 = on right
    signal output root;

    component h[levels];
    component muxL[levels];
    component muxR[levels];
    signal cur[levels + 1];
    cur[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;   // force boolean

        muxL[i] = Mux1();
        muxL[i].c[0] <== cur[i];
        muxL[i].c[1] <== pathElements[i];
        muxL[i].s  <== pathIndices[i];

        muxR[i] = Mux1();
        muxR[i].c[0] <== pathElements[i];
        muxR[i].c[1] <== cur[i];
        muxR[i].s  <== pathIndices[i];

        h[i] = Poseidon(2);
        h[i].inputs[0] <== muxL[i].out;
        h[i].inputs[1] <== muxR[i].out;
        cur[i + 1] <== h[i].out;
    }
    root <== cur[levels];
}
