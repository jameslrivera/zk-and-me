pragma circom 2.1.0;
include "merkle_path.circom";
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/eddsaposeidon.circom";

template SegmentToken(levels) {
    // public
    signal input merkleRoot;
    signal input labPubX;
    signal input labPubY;
    signal input segmentIndex;
    signal input epoch;
    signal input token;

    // private
    signal input segmentHash;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal input sigR8x;
    signal input sigR8y;
    signal input sigS;

    component leafH = Poseidon(2);
    leafH.inputs[0] <== segmentIndex;
    leafH.inputs[1] <== segmentHash;

    component path = MerklePath(levels);
    path.leaf <== leafH.out;
    for (var i = 0; i < levels; i++) {
        path.pathElements[i] <== pathElements[i];
        path.pathIndices[i]  <== pathIndices[i];
    }
    path.root === merkleRoot;

    component sig = EdDSAPoseidonVerifier();
    sig.enabled <== 1;
    sig.Ax  <== labPubX;
    sig.Ay  <== labPubY;
    sig.R8x <== sigR8x;
    sig.R8y <== sigR8y;
    sig.S   <== sigS;
    sig.M   <== merkleRoot;

    component t = Poseidon(3);
    t.inputs[0] <== segmentIndex;
    t.inputs[1] <== segmentHash;
    t.inputs[2] <== epoch;
    token === t.out;
}

component main {public [merkleRoot, labPubX, labPubY, segmentIndex, epoch, token]} = SegmentToken(7);
